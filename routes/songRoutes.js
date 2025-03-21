const express = require('express');
const router = express.Router();
const songController = require('../controllers/songController');

// CRUD Routes
router.post('/', songController.create);
router.post('/bulk-import', songController.bulkImport);
router.get('/', songController.getAll);
router.get('/random', songController.getRandom);
router.get('/random-multiple', songController.getRandomMultiple);
router.get('/:id', songController.getOne);
router.put('/:id', songController.update);
router.delete('/:id', songController.delete);

module.exports = router;
