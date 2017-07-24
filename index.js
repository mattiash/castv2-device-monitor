const chromecastDiscover = require('chromecast-discover')

// import chromecastDiscover from 'chromecast-discover';

chromecastDiscover.on('online', (data) => {
  console.log('Found chromecast: ', data);

});

chromecastDiscover.start();