const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
    name: { type: String, required: true },
    release_year: { type: Number, required: true },
    artist: { type: String, required: true },
    album: { type: String },
    link_or_file: { type: String, required: true }
}, {
    timestamps: true
});

module.exports = mongoose.model('Song', songSchema);
