const Song = require('../models/song');

const songController = {
    // Create a new song
    create: async (req, res) => {
        try {
            // Check if song already exists by name and artist
            const existingSong = await Song.findOne({
               
                link_or_file: req.body.link_or_file
            });

            if (existingSong) {
                return res.status(409).json({ 
                    message: 'Song already exists',
                    song: existingSong 
                });
            }

            const song = new Song(req.body);
            await song.save();
            res.status(201).json(song);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // Bulk import songs from JSON
    bulkImport: async (req, res) => {
        try {
            const songs = req.body;
            if (!Array.isArray(songs)) {
                return res.status(400).json({ message: 'Input must be an array of songs' });
            }

            const results = {
                imported: [],
                duplicates: [],
                errors: []
            };

            for (const songData of songs) {
                try {
                    // Check for duplicates
                    const existingSong = await Song.findOne({
                        name: songData.name,
                        artist: songData.artist,
                        link_or_file: songData.link_or_file
                    });

                    if (existingSong) {
                        results.duplicates.push({
                            song: songData,
                            existing: existingSong
                        });
                        continue;
                    }

                    // Create new song
                    const song = new Song(songData);
                    await song.save();
                    results.imported.push(song);
                } catch (error) {
                    results.errors.push({
                        song: songData,
                        error: error.message
                    });
                }
            }

            res.json({
                message: `Imported ${results.imported.length} songs, ${results.duplicates.length} duplicates found, ${results.errors.length} errors`,
                results
            });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // Get all songs
    getAll: async (req, res) => {
        try {
            const songs = await Song.find();
            res.json(songs);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // Get a random song
    getRandom: async (req, res) => {
        try {
            const count = await Song.countDocuments();
            const random = Math.floor(Math.random() * count);
            const song = await Song.findOne().skip(random);
            if (song) {
                res.json(song);
            } else {
                res.status(404).json({ message: 'No songs found' });
            }
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // Get multiple random songs
    getRandomMultiple: async (req, res) => {
        try {
            const { count = 1 } = req.query;
            const songs = await Song.aggregate([
                { $sample: { size: parseInt(count) } }
            ]);
            res.json(songs);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // Get a single song by ID
    getOne: async (req, res) => {
        try {
            const song = await Song.findById(req.params.id);
            if (song) {
                res.json(song);
            } else {
                res.status(404).json({ message: 'Song not found' });
            }
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // Update a song
    update: async (req, res) => {
        try {
            const song = await Song.findByIdAndUpdate(
                req.params.id,
                req.body,
                { new: true }
            );
            if (song) {
                res.json(song);
            } else {
                res.status(404).json({ message: 'Song not found' });
            }
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // Delete a song
    delete: async (req, res) => {
        try {
            const song = await Song.findByIdAndDelete(req.params.id);
            if (song) {
                res.json({ message: 'Song deleted successfully' });
            } else {
                res.status(404).json({ message: 'Song not found' });
            }
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
};

module.exports = songController;
