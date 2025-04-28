// types/heic-convert.d.ts
declare module 'heic-convert' {
    interface ConvertOptions {
      buffer: Buffer;
      format: 'JPEG' | 'PNG';
      quality?: number;
    }
  
    function heicConvert(options: ConvertOptions): Promise<Buffer>;
  
    export = heicConvert;
  }