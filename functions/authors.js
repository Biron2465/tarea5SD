const mongoose = require('mongoose');
const amqp = require('amqplib'); // Para conectar a RabbitMQ
const Author = require('../models/Author'); // Modelo para Author
require('dotenv').config();

// Conectar a MongoDB (solo se conecta si aún no está conectado)
if (mongoose.connection.readyState === 0) {
  mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
}

// Función para conectar y enviar mensajes a RabbitMQ
async function sendToQueue(message) {
  try {
    const connection = await amqp.connect(process.env.CLOUDAMQP_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue('bookstore', { durable: true });
    channel.sendToQueue('bookstore', Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });
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

exports.handler = async function (event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Password',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: 'OK',
    };
  }

  // Validar el password antes de proceder
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
      // Obtener todos los autores
      const authors = await Author.find();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(authors),
      };
    }

    if (method === 'POST') {
      // Crear un nuevo autor
      const data = JSON.parse(event.body);
      const newAuthor = new Author(data);
      const savedAuthor = await newAuthor.save();

      // Enviar mensaje a RabbitMQ para operación 'add'
      await sendToQueue({ action: 'add', entity: 'author', data: savedAuthor });

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(savedAuthor),
      };
    }

    if (method === 'PUT') {
      const { id, ...updateData } = JSON.parse(event.body);
      const updatedAuthor = await Author.findByIdAndUpdate(id, updateData, { new: true });
      if (!updatedAuthor) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Autor no encontrado' }),
        };
      }

      // Enviar mensaje a RabbitMQ para operación 'update'
      await sendToQueue({ action: 'update', entity: 'author', data: updatedAuthor });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(updatedAuthor),
      };
    }

    if (method === 'DELETE') {
      // Eliminar un autor
      const { id } = JSON.parse(event.body);
      const deletedAuthor = await Author.findByIdAndDelete(id);
      if (!deletedAuthor) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Autor no encontrado' }),
        };
      }

      // Enviar mensaje a RabbitMQ para operación 'delete'
      await sendToQueue({ action: 'delete', entity: 'author', id });

      return {
        statusCode: 204,
        headers,
        body: JSON.stringify({ message: 'Autor eliminado exitosamente' }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Método no permitido' }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
