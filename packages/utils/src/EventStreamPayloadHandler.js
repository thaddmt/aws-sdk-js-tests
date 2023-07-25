import { EventStreamCodec } from "@smithy/eventstream-codec";
import { getEventSigningTransformStream } from "./get-event-signing-stream.js";
export class EventStreamPayloadHandler {
  constructor(options) {
    this.messageSigner = options.messageSigner;
    this.eventStreamCodec = new EventStreamCodec(
      options.utf8Encoder,
      options.utf8Decoder
    );
    this.systemClockOffset = options.systemClockOffset;
  }
  async handle(next, args, context = {}) {
    const request = args.request;
    const { body: payload, headers, query } = request;
    if (!(payload instanceof ReadableStream)) {
      throw new Error("Eventstream payload must be a ReadableStream.");
    }
    const placeHolderStream = new TransformStream();
    request.body = placeHolderStream.readable;
    let result;
    try {
      result = await next(args);
    } catch (e) {
      request.body.cancel();
      throw e;
    }
    const match = (headers["authorization"] || "").match(/Signature=([\w]+)$/);
    const priorSignature =
      (match || [])[1] || (query && query["X-Amz-Signature"]) || "";
    const signingStream = getEventSigningTransformStream(
      priorSignature,
      await this.messageSigner(),
      this.eventStreamCodec,
      this.systemClockOffset
    );
    const signedPayload = payload.pipeThrough(signingStream);
    signedPayload.pipeThrough(placeHolderStream);
    return result;
  }
}
