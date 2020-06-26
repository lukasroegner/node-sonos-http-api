'use strict';
const path = require('path');
const fileDuration = require('../helpers/file-duration');
const settings = require('../../settings');
const isRadioOrLineIn = require('../helpers/is-radio-or-line-in');
const logger = require('sonos-discovery/lib/helpers/logger');

let port;

const LOCAL_PATH_LOCATION = path.join(settings.webroot, 'clips');

function playClipGroup(player, values) {
  const clipFileName = values[0];
  let announceVolume = settings.announceVolume || 40;

  if (/^\d+$/i.test(values[1])) {
    // first parameter is volume
    announceVolume = values[1];
  }

  return fileDuration(path.join(LOCAL_PATH_LOCATION, clipFileName))
      .then((duration) => {

        const group = player.system.zones.find(zone => zone.coordinator.uuid === player.coordinator.uuid);

        const backupPreset = {
          players: [
            { roomName: group.coordinator.roomName, volume: group.coordinator.state.volume }
          ]
        };

        var clipPreset = {
          players: [
            { roomName: group.coordinator.roomName, volume: announceVolume }
          ],
          playMode: {
            repeat: false
          },
          uri: `http://${player.system.localEndpoint}:${port}/clips/${clipFileName}`
        };

        group.members.forEach(function (p) {
          if (group.coordinator.uuid != p.uuid) {
            backupPreset.players.push({ roomName: p.roomName, volume: p.state.volume });
          }
          if (group.coordinator.uuid != p.uuid) {
            clipPreset.players.push({ roomName: p.roomName, volume: announceVolume });
          }
        });

        backupPreset.state = group.coordinator.state.playbackState;
        backupPreset.uri = group.coordinator.avTransportUri;
        backupPreset.metadata = group.coordinator.avTransportUriMetadata;
        backupPreset.playMode = {
          repeat: group.coordinator.state.playMode.repeat
        };

        if (!isRadioOrLineIn(backupPreset.uri)) {
          backupPreset.trackNo = group.coordinator.state.trackNo;
          backupPreset.elapsedTime = group.coordinator.state.elapsedTime;
        }

        logger.info('Clip starting...');
        return player.system.applyPreset(clipPreset).then(() => {
          logger.info('Clip started.');
          return new Promise((resolve) => {
            setTimeout(() => {
              logger.info('Clip half way through, subscribed to stop event.');
              player.once('transport-state', (state) => {
                logger.warn('State changed: ' + state.playbackState);
                if (state.playbackState === 'STOPPED') {
                  logger.info('Clip stopped.');
                  return resolve();
                }
              });
            }, duration / 2);
            setTimeout(() => {
              logger.info('Clip stopped by timeout.');
              return resolve();
            }, duration + 2000);
          });
        }).then(() => {
          logger.info('Previous settings loading...');
          return player.system.applyPreset(backupPreset);
        });
      });
}

module.exports = function(api) {
  port = api.getPort();
  api.registerAction('clipgroup', playClipGroup);
}
