const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const dotenv = require("dotenv");
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

let channel; // AMQP channel

dotenv.config();

async function startOrderConsumer() {
  try {
    const amqp = require("amqplib");
    const connection = await amqp.connect("amqp://localhost");
    channel = await connection.createChannel();
    const queue = "purchase_queue";

    channel.assertQueue(queue, { durable: false });

    console.log("Siparişler dinleniyor...");

    channel.consume(queue, (message) => {
      const order = JSON.parse(message.content.toString());
      console.log("Yeni sipariş alındı:", order);

      // Siparişin işlenmesiyle ilgili diğer işlemleri burada gerçekleştirin...

      if (io) {
        console.log("IO VAR", order.userId);
        const roomId = order.userId; // Kullanıcının benzersiz bir kimliği varsa, odayı kullanıcı kimliğiyle belirleyin

        // İlk odaya mesaj gönderme
        io.to(roomId).emit("updateOrderStatus", {
          orderId: order.id,
          status: "completed",
        });

        // İkinci odaya mesaj gönderme
        io.to("room2").emit("updateOrderStatus", {
          orderId: order.id,
          status: "completed",
        });
      }

      channel.ack(message);
    });

    process.on("SIGINT", () => {
      connection.close();
      process.exit(0);
    });
  } catch (error) {
    console.error("Hata:", error);
    process.exit(1);
  }
}

io.on("connection", (socket) => {
  console.log("Bir kullanıcı bağlandı.");

  socket.on("disconnect", () => {
    console.log("Bir kullanıcı bağlantısını kopardı.");
  });
});

app.get("/", (req, res) => {
  res.send("Sunucu çalışıyor: http://localhost:3002");
});

const port = 3002;
server.listen(port, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${port}`);
});

startOrderConsumer();

const checkProductStock = async (productId, quantity) => {
  // Ürün stok durumunu kontrol etmek için gerekli sorguyu yap
  const query = `
    SELECT stock
    FROM products
    WHERE id = $1
  `;
  const values = [productId];
  const result = await db.query(query, values);

  if (result.rows.length > 0) {
    const stock = result.rows[0].stock;

    if (stock >= quantity) {
      return true; // Stok yeterli ise true döndür
    } else {
      return false; // Stok yetersiz ise false döndür
    }
  } else {
    return false; // Ürün bulunamadı ise false döndür
  }
};
