import { fromHex } from "@smithy/util-hex-encoding";
export const getEventSigningTransformStream = (
  initialSignature,
  messageSigner,
  eventStreamCodec,
  systemClockOffset
) => {
  let priorSignature = initialSignature;
  const transformer = {
    start() {},
    async transform(chunk, controller) {
      try {
        const skewCorrectedDate = new Date(Date.now() + systemClockOffset);
        const dateHeader = {
          ":date": { type: "timestamp", value: skewCorrectedDate },
        };
        const signedMessage = await messageSigner.sign(
          {
            message: {
              body: chunk,
              headers: dateHeader,
            },
            priorSignature: priorSignature,
          },
          {
            signingDate: skewCorrectedDate,
          }
        );
        priorSignature = signedMessage.signature;
        const serializedSigned = eventStreamCodec.encode({
          headers: {
            ...dateHeader,
            ":chunk-signature": {
              type: "binary",
              value: fromHex(signedMessage.signature),
            },
          },
          body: chunk,
        });
        controller.enqueue(serializedSigned);
      } catch (error) {
        controller.error(error);
      }
    },
  };
  return new TransformStream({ ...transformer });
};
