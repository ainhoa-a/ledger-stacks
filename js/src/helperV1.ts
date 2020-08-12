import { CLA, errorCodeToString, INS, PAYLOAD_TYPE, processErrorResponse, LedgerError } from './common';
import BlockstackApp from '.';
import { ResponseSign } from './types';

const HARDENED = 0x80000000;

export function serializePathv1(path: string) {
  if (typeof path !== 'string') {
    throw new Error("Path should be a string (e.g \"m/44'/5757'/5'/0/3\")");
  }

  if (!path.startsWith('m')) {
    throw new Error('Path should start with "m" (e.g "m/44\'/5757\'/5\'/0/3")');
  }

  const pathArray = path.split('/');

  if (pathArray.length !== 6) {
    throw new Error("Invalid path. (e.g \"m/44'/5757'/5'/0/3\")");
  }

  const buf = Buffer.alloc(20);

  for (let i = 1; i < pathArray.length; i += 1) {
    let value = 0;
    let child = pathArray[i];
    if (child.endsWith("'")) {
      value += HARDENED;
      child = child.slice(0, -1);
    }

    const childNumber = Number(child);

    if (Number.isNaN(childNumber)) {
      throw new Error(`Invalid path : ${child} is not a number. (e.g "m/44'/461'/5'/0/3")`);
    }

    if (childNumber >= HARDENED) {
      throw new Error('Incorrect child value (bigger or equal to 0x80000000)');
    }

    value += childNumber;

    buf.writeUInt32LE(value, 4 * (i - 1));
  }

  return buf;
}

export async function signSendChunkv1(
  app: BlockstackApp,
  chunkIdx: number,
  chunkNum: number,
  chunk: Buffer
): Promise<ResponseSign> {
  let payloadType = PAYLOAD_TYPE.ADD;
  if (chunkIdx === 1) {
    payloadType = PAYLOAD_TYPE.INIT;
  }
  if (chunkIdx === chunkNum) {
    payloadType = PAYLOAD_TYPE.LAST;
  }
  return app.transport
    .send(CLA, INS.SIGN_SECP256K1, payloadType, 0, chunk, [
      LedgerError.NoErrors,
      LedgerError.DataIsInvalid,
      LedgerError.BadKeyHandle,
    ])
    .then(response => {
      const errorCodeData = response.slice(-2);
      const returnCode = errorCodeData[0] * 256 + errorCodeData[1];
      let errorMessage = errorCodeToString(returnCode as LedgerError);

      if (returnCode === LedgerError.BadKeyHandle || returnCode === LedgerError.DataIsInvalid) {
        errorMessage = `${errorMessage} : ${response
          .slice(0, response.length - 2)
          .toString('ascii')}`;
      }

      if (response.length > 2) {
        const signatureCompact = response.slice(0, 65);
        const signatureDER = response.slice(65, response.length - 2);

        return {
          signatureCompact,
          signatureDER,
          returnCode: returnCode,
          errorMessage: errorMessage,
        };
      }

      return {
        returnCode: returnCode,
        errorMessage: errorMessage,
      };
    }, processErrorResponse);
}
