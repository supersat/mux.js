'use strict';

var Stream = require('../utils/stream.js');

var Ac3Stream;

var
  AC3_SAMPLING_FREQUENCIES = [
    48000,
    44100,
    32000,
    0 // Reserved
  ];

var
  AC3_FRAME_BITRATES = [
    32000,
    40000,
    48000,
    56000,
    64000,
    80000,
    96000,
    112000,
    128000,
    160000,
    192000,
    224000,
    256000,
    320000,
    384000,
    448000,
    512000,
    576000,
    640000
  ];

/*
 * FIXME: Change this comment
 * Accepts a ElementaryStream and emits data events with parsed
 * AAC Audio Frames of the individual packets. Input audio in ADTS
 * format is unpacked and re-emitted as AAC frames.
 *
 * @see http://wiki.multimedia.cx/index.php?title=ADTS
 * @see http://wiki.multimedia.cx/?title=Understanding_AAC
 */
Ac3Stream = function() {
  var buffer;

  Ac3Stream.prototype.init.call(this);

  this.push = function(packet) {
    var
      i = 0,
      frameNum = 0,
      sampleRate,
      frameLength,
      fscod,
      bitRateCode,
      frameEnd,
      oldBuffer,
      sampleCount,
      ac3FrameDuration;

    if (packet.type !== 'audio') {
      // ignore non-audio data
      return;
    }

    // Prepend any data in the buffer to the input data so that we can parse
    // AC-3 frames the cross a PES packet boundary
    if (buffer) {
      oldBuffer = buffer;
      buffer = new Uint8Array(oldBuffer.byteLength + packet.data.byteLength);
      buffer.set(oldBuffer);
      buffer.set(packet.data, oldBuffer.byteLength);
    } else {
      buffer = packet.data;
    }

    // unpack any AC-3 frames which have been fully received
    while (i + 5 < buffer.length) {

      // Loook for the start of an AC3 header..
      if (buffer[i] !== 0x0B || buffer[i + 1] !== 0x77) {
        // If a valid header was not found,  jump one forward and attempt to
        // find a valid AC3 header starting at the next byte
        i++;
        continue;
      }

      sampleCount = 1536; // This is fixed by the AC-3 spec
      fscod = (buffer[i + 4] & 0xc0) >>> 6;
      sampleRate = AC3_SAMPLING_FREQUENCIES[fscod];
      ac3FrameDuration = (sampleCount * 90000) / sampleRate;
      bitRateCode = (buffer[i + 4] & 0x3e) >>> 1;
      frameLength = AC3_FRAME_BITRATES[bitRateCode] * 192 / sampleRate;

      frameEnd = i + frameLength;

      // If we don't have enough data to actually finish this AC3 frame, return
      // and wait for more data
      if (buffer.byteLength < frameEnd) {
        return;
      }

      // Otherwise, deliver the complete AC3 frame
      this.trigger('data', {
        pts: packet.pts + (frameNum * ac3FrameDuration),
        dts: packet.dts + (frameNum * ac3FrameDuration),
        sampleCount: sampleCount,
        samplerate: sampleRate,
        samplesize: 16,
        fscod: fscod,
        bsid: (buffer[i + 5] & 0xf8) >>> 3,
        bsmod: (buffer[i + 5] & 0x07),
        acmod: (buffer[i + 6] & 0xe0) >>> 5,
        lfeon: (buffer[i + 6] & 0x01), // FIXME: This is broken but works for most streams
        bitratecode: bitRateCode,
        data: buffer.subarray(i, frameEnd)
      });

      // If the buffer is empty, clear it and return
      if (buffer.byteLength === frameEnd) {
        buffer = undefined;
        return;
      }

      frameNum++;

      // Remove the finished frame from the buffer and start the process again
      buffer = buffer.subarray(frameEnd);
    }
  };
  this.flush = function() {
    this.trigger('done');
  };
};

Ac3Stream.prototype = new Stream();

module.exports = Ac3Stream;
