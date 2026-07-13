package com.qixingovo.photos;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private ValueCallback<Uri[]> filePathCallback;

    private static final String PRIMARY_URL = "https://ours.qixingovo.cn";
    private static final String FALLBACK_URL = "https://photo.qixingovo.cn";
    private static final int TIMEOUT_MS = 3000;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();

        // 双域名自动切换：5 秒超时 + 错误回调，双重保险
        final boolean[] triedFallback = {false};
        final Handler handler = new Handler(Looper.getMainLooper());
        final WebViewClient originalClient = webView.getWebViewClient();

        // 3 秒超时：如果主域名没加载完，切到备用域名
        final Runnable fallbackRunner = () -> {
            if (!triedFallback[0]) {
                triedFallback[0] = true;
                webView.stopLoading();
                webView.loadUrl(FALLBACK_URL);
            }
        };
        handler.postDelayed(fallbackRunner, TIMEOUT_MS);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                // 任意域名加载成功 → 取消超时
                handler.removeCallbacks(fallbackRunner);
                if (originalClient != null) originalClient.onPageFinished(view, url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                         WebResourceError error) {
                if (!triedFallback[0] && request.isForMainFrame()) {
                    triedFallback[0] = true;
                    handler.removeCallbacks(fallbackRunner);
                    handler.post(() -> view.loadUrl(FALLBACK_URL));
                } else if (originalClient != null) {
                    originalClient.onReceivedError(view, request, error);
                }
            }

            @Override
            public void onReceivedSslError(WebView view,
                                            android.webkit.SslErrorHandler sslHandler,
                                            android.net.http.SslError error) {
                // SSL 错误也触发 fallback
                if (!triedFallback[0]) {
                    triedFallback[0] = true;
                    handler.removeCallbacks(fallbackRunner);
                    sslHandler.cancel();
                    handler.post(() -> view.loadUrl(FALLBACK_URL));
                } else if (originalClient != null) {
                    originalClient.onReceivedSslError(view, sslHandler, error);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view,
                                                     WebResourceRequest request) {
                if (originalClient != null)
                    return originalClient.shouldOverrideUrlLoading(view, request);
                return false;
            }
        });

        // 允许 file:// 发网络请求（CORS fix）
        android.webkit.WebSettings settings = webView.getSettings();
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setDomStorageEnabled(true);

        // 文件选择器回调
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback,
                                              FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                Intent intent = params.createIntent();
                try {
                    startActivityForResult(intent, 100);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == 100) {
            if (filePathCallback != null) {
                Uri[] results = null;
                if (resultCode == RESULT_OK && data != null) {
                    String dataString = data.getDataString();
                    if (dataString != null) {
                        results = new Uri[]{Uri.parse(dataString)};
                    }
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }
}
