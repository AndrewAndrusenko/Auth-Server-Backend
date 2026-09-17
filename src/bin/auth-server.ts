import { HttpError } from 'http-errors';
import 'dotenv/config'
import Debug from 'debug'
import * as http from 'http';
import {app} from '../app';
import { mongoDBClient } from '../modules/mongodb-module';


const debug = Debug('server-mongodb-rest-http:server')
const port = normalizePort(process.env.SERVER_PORT || '3000');
app.set('port', port);

export const mongoClient = new mongoDBClient();

const server = http.createServer(app);

async function startServer() {
  try {
    console.log('Connecting to MongoDb pool...');
    await mongoClient.connect()
    console.log('Connection to MongoDB established');

    server.listen(port);
    server.on('error', onError);
    server.on('listening', onListening);

    const serverShutdown = async (cmd:string) => {
      console.log(`\nCommand ${cmd}. Server is shutting down...`);
      server.close(async () => {
        console.log('Disconnecting from MongoDb pool...');
        await mongoClient.close();
        console.log('MongoDb connection pool has been closed');
        process.exit(0);
      });
    };
    process.on('SIGTERM',() => serverShutdown ('SIGTERM'));
    process.on('SIGINT',() => serverShutdown ('SIGINT'));

  } catch (error) {
    console.error('Error occurred while server starting',error)
  }
}

startServer();

function normalizePort(val:string) {
  var port = parseInt(val, 10);
  if (isNaN(port)) {return val; }
  if (port >= 0) {return port;}
  return false;
}
function onError(error:HttpError) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
    default:
      throw error;
  }
}
function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr?.port;
    debug('Listening on ' + bind);
    console.log('Listening on ' + bind + ' in ' + process.env.NODE_ENV + ' mode');
}