declare module "sharp" {
  type SharpInstance = {
    png(): SharpInstance;
    raw(): SharpInstance;
    removeAlpha(): SharpInstance;
    resize(width: number, height: number, options?: { fit?: string; position?: string }): SharpInstance;
    toBuffer(): Promise<Buffer>;
  };

  export default function sharp(input?: Buffer | string): SharpInstance;
}
