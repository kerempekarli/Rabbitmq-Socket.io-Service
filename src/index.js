const express = require("express");
const http = require("http");
const startSocketServer = require("./socketServer");
const amqp = require("amqplib");
const processOrder = require("./processOrder");
const app = express();
const httpServer = http.createServer(app);
const io = startSocketServer(httpServer);
const dotenv = require("dotenv");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_TEST);
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

dotenv.config();
console.log(process.env.EMAIL_USER);
const startConsumer = async () => {
  try {
    const connection = await amqp.connect("amqp://localhost");
    const channel = await connection.createChannel();
    const queue = "purchase_queue";

    // Queue'yu oluştur
    await channel.assertQueue(queue, { durable: true });

    console.log("Consumer başlatıldı. Queue bekleniyor...");

    // Mesajları dinle
    channel.consume(queue, (msg) => {
      const orderData = JSON.parse(msg.content.toString());
      console.log("Sipariş alındı ve işleniyor.");
      // Siparişi işle
      processOrder(orderData, io);

      // Mesajı işlendik olarak işaretle
      channel.ack(msg);
    });
  } catch (error) {
    console.error("Hata:", error);
  }
};

// Consumer'ı başlat
startConsumer();

const port = 3002;
httpServer.listen(port, () => {
  console.log(`Socket.IO sunucusu ${port} portunda çalışıyor...`);
});
