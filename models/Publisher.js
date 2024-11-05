const mongoose = require('mongoose');

// Define el esquema para los libros asociados a un editor
const BookSchema = new mongoose.Schema({
    book_id: Number,
    title: String
}, { _id: false });

const PublisherSchema = new mongoose.Schema({
    id: Number,
    publisher: String,
    country: String,
    founded: Number,
    genre: String,
    books: [BookSchema]
});

module.exports = mongoose.model('Publisher', PublisherSchema);

