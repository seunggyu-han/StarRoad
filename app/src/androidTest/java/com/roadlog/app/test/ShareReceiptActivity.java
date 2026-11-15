package com.roadlog.app.test;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.TextView;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Locale;

/** Test APK only. Read the user's shared URI under the receiver's own UID. */
public class ShareReceiptActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TextView result = new TextView(this);
        setContentView(result);
        Intent send = getIntent();
        Object stream = send.getParcelableExtra(Intent.EXTRA_STREAM);
        Uri uri = stream instanceof Uri ? (Uri) stream : null;
        if (!Intent.ACTION_SEND.equals(send.getAction()) || !"image/png".equals(send.getType()) ||
                uri == null || !ContentResolver.SCHEME_CONTENT.equals(uri.getScheme()) ||
                !"com.roadlog.app.files".equals(uri.getAuthority()) ||
                uri.getPathSegments().size() != 2 || !"share".equals(uri.getPathSegments().get(0))) {
            result.setText("Unexpected URI");
            return;
        }
        try (InputStream image = getContentResolver().openInputStream(uri)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[16384];
            int size;
            while ((size = image.read(buffer)) != -1) digest.update(buffer, 0, size);
            StringBuilder hex = new StringBuilder();
            for (byte b : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", b & 255));
            result.setText(hex.toString());
        } catch (Exception failure) {
            result.setText(failure.toString());
        }
    }
}
