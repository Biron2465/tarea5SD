const mongoose = require('mongoose');

const BookSchema = new mongoose.Schema({
    book_id: Number,
    title: String
}, { _id: false });

const AuthorSchema = new mongoose.Schema({
    id: Number,
    author: String,
    nationality: String,
    birth_year: Number,
    fields: String,
    books: [BookSchema]
});

module.exports = mongoose.model('Author', AuthorSchema);

