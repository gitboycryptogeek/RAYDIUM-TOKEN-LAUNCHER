// Required polyfills for browser environment
import 'process/browser';
import { Buffer } from 'buffer';
import 'stream-http';

// Make Buffer available globally
window.Buffer = Buffer;
 require.resolve("stream-http") ;

// Make process available globally
window.process = window.process || {
  env: {},
  browser: true,
  version: '',
  nextTick: function(fn) { setTimeout(fn, 0); }
};