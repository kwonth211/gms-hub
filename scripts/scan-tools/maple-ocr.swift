// On-device OCR; stdout contains JSON text boxes in image-pixel coordinates.
import Foundation
import Vision
import ImageIO
let args=CommandLine.arguments
if args.count<2 {exit(2)}
guard let source=CGImageSourceCreateWithURL(URL(fileURLWithPath:args[1]) as CFURL,nil),let original=CGImageSourceCreateImageAtIndex(source,0,nil) else {exit(3)}
var image=original
// Same high-quality 2x crop enlargement used by gms-hub-shop/vis.swift.
// Keep original colours: thresholding can erase thin strokes in tooltip digits.
let scale=args.count>3 ? Double(args[3]) ?? 1 : 1
if scale>1 && scale<=3 {
 let width=Int(Double(image.width)*scale),height=Int(Double(image.height)*scale)
 guard let context=CGContext(data:nil,width:width,height:height,bitsPerComponent:8,bytesPerRow:0,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else {exit(3)}
 context.interpolationQuality = .high
 context.draw(image,in:CGRect(x:0,y:0,width:width,height:height))
 guard let resized=context.makeImage() else {exit(3)}
 image=resized
}
let request=VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages=["en-US"]
request.usesLanguageCorrection=false
if args.count>2 {request.customWords=[args[2]]}
do {
 try VNImageRequestHandler(cgImage:image,options:[:]).perform([request])
 let rows=(request.results ?? []).compactMap { row -> [String:Any]? in
  guard let candidate=row.topCandidates(1).first else {return nil}
  let b=row.boundingBox
  var result:[String:Any] = ["text":candidate.string,"confidence":candidate.confidence,"x":b.minX*Double(image.width),"y":(1-b.maxY)*Double(image.height),"w":b.width*Double(image.width),"h":b.height*Double(image.height)]
  // A translucent tooltip title can be merged with chat behind it. Locate the
  // requested substring so the caller can re-read its own crop, not the chat's left edge.
  if args.count>2,let range=candidate.string.range(of:args[2],options:.caseInsensitive),
     let observation=try? candidate.boundingBox(for:range) {
    let q=observation.boundingBox
    result["itemBounds"]=["x":q.minX*Double(image.width),"y":(1-q.maxY)*Double(image.height),"w":q.width*Double(image.width),"h":q.height*Double(image.height)]
    result["itemInBrackets"] = candidate.string[..<range.lowerBound].trimmingCharacters(in:.whitespaces).last == "[" || candidate.string[range.upperBound...].trimmingCharacters(in:.whitespaces).first == "]"
  }
  return result
 }
 print(String(data:try JSONSerialization.data(withJSONObject:rows),encoding:.utf8)!)
} catch {fputs("maple-ocr: recognition failed\n",stderr);exit(4)}
