// Event-driven (async) TCP: server.on('connection') and socket.on('data'/'end')
// fire on their own, driven by the net poll pump wired into the event loop.
import net from "node:net";

const server = net.createServer();
server.on("connection", (sock) => {
    sock.setEncoding("utf8");
    sock.on("data", (chunk) => {
        console.log("server recv " + chunk);
        sock.write("reply:" + chunk);
    });
    sock.on("end", () => {
        console.log("server end");
        server.close();
    });
});
server.listen(0, "127.0.0.1");
const port = server.address().port;

const client = net.connect(port, "127.0.0.1");
client.setEncoding("utf8");
client.on("data", (data) => { console.log("client recv " + data); });
client.on("end", () => { console.log("client end"); });
client.write("ping");
client.end();
