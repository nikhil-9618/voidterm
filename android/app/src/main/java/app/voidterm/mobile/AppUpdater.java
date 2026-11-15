package app.voidterm.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Small release checker backed by the repository's GitHub Releases. It runs
 * off the UI thread and stays silent on network or rate-limit failures.
 */
final class AppUpdater {
    private static final String LATEST_RELEASE =
            "https://api.github.com/repos/nikhil-9618/voidterm/releases/latest";

    private AppUpdater() {
    }

    static void check(Activity activity) {
        final String current = BuildConfig.VERSION_NAME;
        if (current == null || current.isEmpty()) {
            return;
        }

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(LATEST_RELEASE).openConnection();
                connection.setConnectTimeout(6000);
                connection.setReadTimeout(6000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("User-Agent", "VOIDTERMAndroid/" + current);

                if (connection.getResponseCode() != 200) {
                    return;
                }

                StringBuilder body = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                        connection.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        body.append(line);
                    }
                }

                JSONObject release = new JSONObject(body.toString());
                String tag = release.optString("tag_name", "");
                String latest = tag.startsWith("v") ? tag.substring(1) : tag;
                if (!isNewer(latest, current)) {
                    return;
                }

                String downloadUrl = release.optString("html_url", "");
                JSONArray assets = release.optJSONArray("assets");
                if (assets != null) {
                    for (int index = 0; index < assets.length(); index++) {
                        JSONObject asset = assets.getJSONObject(index);
                        if (asset.optString("name", "").toLowerCase().endsWith(".apk")) {
                            downloadUrl = asset.optString("browser_download_url", downloadUrl);
                            break;
                        }
                    }
                }

                if (downloadUrl.isEmpty()) {
                    return;
                }

                final String target = downloadUrl;
                activity.runOnUiThread(() -> new AlertDialog.Builder(activity)
                        .setTitle("Update available")
                        .setMessage("VOIDTERM " + latest + " is available. You have " + current + ".")
                        .setPositiveButton("Download", (dialog, which) -> {
                            try {
                                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(target)));
                            } catch (ActivityNotFoundException exception) {
                                Toast.makeText(
                                        activity,
                                        "No browser available to download the update",
                                        Toast.LENGTH_SHORT).show();
                            }
                        })
                        .setNegativeButton("Later", null)
                        .show());
            } catch (Exception ignored) {
                // Update checks are best-effort and must never interrupt the app.
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        }, "voidterm-update-check").start();
    }

    private static boolean isNewer(String latest, String current) {
        int[] next = parseVersion(latest);
        int[] installed = parseVersion(current);
        int length = Math.max(next.length, installed.length);
        for (int index = 0; index < length; index++) {
            int left = index < next.length ? next[index] : 0;
            int right = index < installed.length ? installed[index] : 0;
            if (left != right) {
                return left > right;
            }
        }
        return false;
    }

    private static int[] parseVersion(String version) {
        String[] parts = version.split("\\.");
        int[] values = new int[parts.length];
        for (int index = 0; index < parts.length; index++) {
            String digits = parts[index].replaceAll("[^0-9].*$", "");
            try {
                values[index] = digits.isEmpty() ? 0 : Integer.parseInt(digits);
            } catch (NumberFormatException exception) {
                values[index] = 0;
            }
        }
        return values;
    }
}
