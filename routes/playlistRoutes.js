const express = require('express');
const router = express.Router();
const { processPlaylist } = require('../controllers/playlistController');

router.post('/process', processPlaylist);

module.exports = router;
