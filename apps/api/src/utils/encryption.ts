import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedRecord {
  encryptedPayload: Buffer;
  iv: Buffer;
  authTag: Buffer;
  encryptionVersion: number;
}

interface PackedEnvelope {
  v: number;
  iv: string;
  tag: string;
  data: string;
}

export class EncryptionService {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('Encryption key must contain exactly 32 bytes.');
  }

  encrypt(plaintext: Buffer): EncryptedRecord {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encryptedPayload = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      encryptedPayload,
      iv,
      authTag: cipher.getAuthTag(),
      encryptionVersion: 1,
    };
  }

  decrypt(record: EncryptedRecord): Buffer {
    if (record.encryptionVersion !== 1) throw new Error('Unsupported encryption version.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, record.iv);
    decipher.setAuthTag(record.authTag);
    return Buffer.concat([decipher.update(record.encryptedPayload), decipher.final()]);
  }

  encryptPacked(plaintext: string): Buffer {
    const encrypted = this.encrypt(Buffer.from(plaintext, 'utf8'));
    const envelope: PackedEnvelope = {
      v: encrypted.encryptionVersion,
      iv: encrypted.iv.toString('base64'),
      tag: encrypted.authTag.toString('base64'),
      data: encrypted.encryptedPayload.toString('base64'),
    };
    return Buffer.from(JSON.stringify(envelope), 'utf8');
  }

  decryptPacked(payload: Uint8Array): string {
    const envelope = JSON.parse(Buffer.from(payload).toString('utf8')) as PackedEnvelope;
    return this.decrypt({
      encryptionVersion: envelope.v,
      iv: Buffer.from(envelope.iv, 'base64'),
      authTag: Buffer.from(envelope.tag, 'base64'),
      encryptedPayload: Buffer.from(envelope.data, 'base64'),
    }).toString('utf8');
  }
}
