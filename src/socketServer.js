const socketIO = require("socket.io");

const startSocketServer = (httpServer) => {
  const io = socketIO(httpServer, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("Kullanıcı bağlandı");

    // İsteğinizi burada tanımlayabilirsiniz

    socket.on("joinRoom", (roomId) => {
      socket.join(roomId);
      console.log(`Kullanıcı odaya katıldı: ${roomId}`);
    });

    socket.on("leaveRoom", (roomId) => {
      socket.leave(roomId);
      console.log(`Kullanıcı odayı terk etti: ${roomId}`);
    });

    socket.on("disconnect", () => {
      console.log("Kullanıcı bağlantısı koptu");
    });
  });

  return io;
};

module.exports = startSocketServer;
