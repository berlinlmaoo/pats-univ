import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;
import com.google.zxing.EncodeHintType;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import java.util.Map;

/** Produces a QR poster for the emulator's virtual-scene camera, using the app's encoder. */
public class QrImage {
    public static void main(String[] args) throws Exception {
        var matrix = new MultiFormatWriter().encode(args[0], BarcodeFormat.QR_CODE, 1024, 1024, Map.of(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M));
        var image = new BufferedImage(1024, 1024, BufferedImage.TYPE_INT_RGB);
        boolean tile = args.length > 2 && args[2].equals("onTile");
        double brightness = args.length > 3 ? Double.parseDouble(args[3]) : 1;
        for (int y = 0; y < 1024; y++) for (int x = 0; x < 1024; x++) {
            int rgb = matrix.get(x,y) ? (tile ? 0xffffff : 0x001836) : (tile ? 0x3f1d1d : 0xffffff);
            int r = (int)(((rgb >> 16) & 255)*brightness), g = (int)(((rgb >> 8) & 255)*brightness), b = (int)((rgb & 255)*brightness);
            image.setRGB(x,y,(r<<16)|(g<<8)|b);
        }
        ImageIO.write(image, "png", new File(args[1]));
    }
}
