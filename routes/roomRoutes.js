const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');

// Room management routes
router.post('/create', roomController.create);
router.post('/join', roomController.join);
router.get('/:roomId/state', roomController.getState);
router.post('/start', roomController.startGame);
router.put('/:roomId/state', roomController.updateState);

module.exports = router;
