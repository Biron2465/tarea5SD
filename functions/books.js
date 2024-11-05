// books.js
const mongoose = require('mongoose');
const amqp = require('amqplib');
const Book = require('../models/Book');
require('dotenv').config();

if (mongoose.connection.readyState === 0) {
    mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
}

async function sendToQueue(message) {
    try {
        const connection = await amqp.connect(process.env.CLOUDAMQP_URL);
        const channel = await connection.createChannel();
        await channel.assertQueue('bookstore', { durable: true });
        channel.sendToQueue('bookstore', Buffer.from(JSON.stringify(message)), { persistent: true });
        await channel.close();
        await connection.close();
    } catch (err) {
        console.error('Error enviando mensaje a RabbitMQ', err);
    }
}

// Validar el password usando el encabezado
function checkPassword(headers) {
    const password = headers['x-password'];
    return password === process.env.USER_PASSWORD;
}

exports.handler = async function(event, context) {
  const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Password'
  };

  if (event.httpMethod === 'OPTIONS') {
      return {
          statusCode: 200,
          headers,
          body: 'OK'
      };
  }

  // Validar el password directamente desde el encabezado
  if (!checkPassword(event.headers)) {
      return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ message: 'Password incorrecto' })
      };
  }

  try {
      const method = event.httpMethod;

      if (method === 'GET') {
          const books = await Book.find();
          return {
              statusCode: 200,
              headers,
              body: JSON.stringify(books)
          };
      }

      // Otros métodos como POST, PUT, DELETE permanecen iguales

      return {
          statusCode: 405,
          headers,
          body: JSON.stringify({ message: 'Método no permitido' })
      };
  } catch (error) {
      return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: error.message })
      };
  }
};
