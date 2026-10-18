import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/** Produces a QR poster for the emulator's virtual-scene camera, using the app's encoder. */
public class QrImage {
    public static void main(String[] args) throws Exception {
        var matrix = new MultiFormatWriter().encode(args[0], BarcodeFormat.QR_CODE, 1024, 1024);
        var image = new BufferedImage(1024, 1024, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 1024; y++) for (int x = 0; x < 1024; x++) image.setRGB(x, y, matrix.get(x, y) ? 0x001836 : 0xffffff);
        ImageIO.write(image, "png", new File(args[1]));
    }
}
