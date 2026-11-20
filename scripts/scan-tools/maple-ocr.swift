// On-device OCR; stdout contains JSON text boxes in image-pixel coordinates.
import Foundation
import Vision
import ImageIO
let args=CommandLine.arguments
if args.count<2 {exit(2)}
guard let source=CGImageSourceCreateWithURL(URL(fileURLWithPath:args[1]) as CFURL,nil),let image=CGImageSourceCreateImageAtIndex(source,0,nil) else {exit(3)}
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
  return ["text":candidate.string,"confidence":candidate.confidence,"x":b.minX*Double(image.width),"y":(1-b.maxY)*Double(image.height),"w":b.width*Double(image.width),"h":b.height*Double(image.height)]
 }
 print(String(data:try JSONSerialization.data(withJSONObject:rows),encoding:.utf8)!)
} catch {fputs("maple-ocr: recognition failed\n",stderr);exit(4)}
