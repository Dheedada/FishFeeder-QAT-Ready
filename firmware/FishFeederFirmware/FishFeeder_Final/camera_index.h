#include <Arduino.h>

const char index_ov2640_html_gz[] PROGMEM = R"rawliteral(
<!doctype html>
<html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Fish Feeding Monitoring System</title>
        <style>
            body { font-family: Arial, Helvetica, sans-serif; background: #181818; color: #EFEFEF; text-align: center; }
            .button { display: block; width: 100%; max-width: 300px; padding: 20px; margin: 20px auto; background: #28a745; color: white; text-decoration: none; border-radius: 10px; font-size: 24px; font-weight: bold; cursor: pointer; border: none; }
            .button:active { background: #1e7e34; transform: translateY(2px); }
            .btn-monitor { background: #007bff; }
            img { width: 100%; max-width: 600px; border: 5px solid #333; border-radius: 10px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <h1>Mobile Fish Feeding System</h1>
        <img src="" id="stream">
        
        <button class="button btn-monitor" onclick="startStream()">START MONITORING</button>
        <button class="button" onclick="feed()">FEED FISH NOW</button>

        <script>
            var baseHost = document.location.origin
            var streamUrl = baseHost + ':81'

            function startStream() {
                document.getElementById('stream').src = streamUrl + '/stream';
            }

            function feed() {
                fetch(baseHost + '/control?var=feed&val=1');
                alert("Feeding Signal Sent!");
            }
        </script>
    </body>
</html>
)rawliteral";

// We calculate the length automatically
const size_t index_ov2640_html_gz_len = sizeof(index_ov2640_html_gz) - 1;

// Placeholders for other camera models
const char index_ov3660_html_gz[] PROGMEM = "";
const size_t index_ov3660_html_gz_len = 0;
const char index_ov5640_html_gz[] PROGMEM = "";
const size_t index_ov5640_html_gz_len = 0;
