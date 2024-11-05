const mongoose = require('mongoose');
const amqp = require('amqplib'); // Para conectar a RabbitMQ
const Publisher = require('../models/Publisher');
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
    'Access-Control-Allow-Headers': 'Content-Type, X-Password'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: 'OK'
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
      // Obtener todas las editoriales
      const publishers = await Publisher.find();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(publishers)
      };
    }

    if (method === 'POST') {
      // Crear una nueva editorial
      const data = JSON.parse(event.body);
      const newPublisher = new Publisher(data);
      const savedPublisher = await newPublisher.save();

      // Enviar mensaje a RabbitMQ para operación 'add'
      await sendToQueue({ action: 'add', entity: 'publisher', data: savedPublisher });

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(savedPublisher)
      };
    }

    if (method === 'PUT') {
      // Actualizar una editorial existente
      const { id, ...updateData } = JSON.parse(event.body);
      const updatedPublisher = await Publisher.findByIdAndUpdate(id, updateData, { new: true });

      // Enviar mensaje a RabbitMQ para operación 'update'
      await sendToQueue({ action: 'update', entity: 'publisher', data: updatedPublisher });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(updatedPublisher)
      };
    }

    if (method === 'DELETE') {
      // Eliminar una editorial
      const { id } = JSON.parse(event.body);
      await Publisher.findByIdAndDelete(id);

      // Enviar mensaje a RabbitMQ para operación 'delete'
      await sendToQueue({ action: 'delete', entity: 'publisher', id });

      return {
        statusCode: 204,
        headers,
        body: JSON.stringify({ message: 'Publisher eliminado exitosamente' })
      };
    }

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
