#include "esp_http_server.h"
#include "esp_timer.h"
#include "esp_camera.h"
#include "img_converters.h"
#include <Arduino.h>

extern void feedFish(); 
extern int currentFoodLevel; 

// --- ADDED: Variables from the main file for the Smart Schedule ---
extern String schedule1;
extern String schedule2;
extern bool sched1Active;
extern bool sched2Active;

httpd_handle_t api_httpd = NULL;
httpd_handle_t stream_httpd = NULL;

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

static esp_err_t stream_handler(httpd_req_t *req){
    camera_fb_t * fb = NULL;
    esp_err_t res = ESP_OK;
    char * part_buf[64];

    res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
    if(res != ESP_OK) return res;
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

    while(true){
        fb = esp_camera_fb_get();
        if (!fb) {
            Serial.println("Camera capture failed");
            res = ESP_FAIL;
        } else {
            if(res == ESP_OK) res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
            if(res == ESP_OK){
                size_t hlen = snprintf((char *)part_buf, 64, _STREAM_PART, fb->len);
                res = httpd_resp_send_chunk(req, (const char *)part_buf, hlen);
            }
            if(res == ESP_OK) res = httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
            esp_camera_fb_return(fb);
        }
        if(res != ESP_OK) break;
    }
    return res;
}

static esp_err_t feed_handler(httpd_req_t *req){
    feedFish();
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, "OK", 2);
}

static esp_err_t level_handler(httpd_req_t *req){
    char buf[10];
    itoa(currentFoodLevel, buf, 10);
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, buf, HTTPD_RESP_USE_STRLEN);
}

// --- ADDED: REBOOT HANDLER ---
static esp_err_t reboot_handler(httpd_req_t *req){
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_send(req, "Rebooting...", HTTPD_RESP_USE_STRLEN);
    delay(1000); // Give it a second to send the response before restarting
    ESP.restart();
    return ESP_OK;
}

// --- ADDED: REFILL HANDLER (Prevents crashes if app calls it) ---
static esp_err_t refill_handler(httpd_req_t *req){
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, "OK", 2);
}

// --- ADDED: UPDATE SCHEDULE HANDLER ---
static esp_err_t update_schedule_handler(httpd_req_t *req){
    char buf[100];
    if (httpd_req_get_url_query_str(req, buf, sizeof(buf)) == ESP_OK) {
        char param[10];
        if (httpd_query_key_value(buf, "s1", param, sizeof(param)) == ESP_OK) schedule1 = String(param);
        if (httpd_query_key_value(buf, "a1", param, sizeof(param)) == ESP_OK) sched1Active = (String(param) == "1");
        if (httpd_query_key_value(buf, "s2", param, sizeof(param)) == ESP_OK) schedule2 = String(param);
        if (httpd_query_key_value(buf, "a2", param, sizeof(param)) == ESP_OK) sched2Active = (String(param) == "1");
        
        Serial.println("--- NEW SCHEDULES FROM APP ---");
        Serial.println("Schedule 1: " + schedule1 + " (Active: " + sched1Active + ")");
        Serial.println("Schedule 2: " + schedule2 + " (Active: " + sched2Active + ")");
    }
    
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, "Schedule Updated", HTTPD_RESP_USE_STRLEN);
}

void startCameraServer(){
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    
    // --- SERVER 1: API (Port 80) ---
    config.server_port = 80;
    config.ctrl_port = 80;
    httpd_uri_t feed_uri = { .uri = "/feed", .method = HTTP_GET, .handler = feed_handler, .user_ctx = NULL };
    httpd_uri_t level_uri = { .uri = "/level", .method = HTTP_GET, .handler = level_handler, .user_ctx = NULL };
    
    // --- ADDED: Register the new endpoints ---
    httpd_uri_t reboot_uri = { .uri = "/reboot", .method = HTTP_GET, .handler = reboot_handler, .user_ctx = NULL };
    httpd_uri_t refill_uri = { .uri = "/refill", .method = HTTP_GET, .handler = refill_handler, .user_ctx = NULL };
    httpd_uri_t update_sched_uri = { .uri = "/update_schedule", .method = HTTP_GET, .handler = update_schedule_handler, .user_ctx = NULL };
    
    if (httpd_start(&api_httpd, &config) == ESP_OK) {
        httpd_register_uri_handler(api_httpd, &feed_uri);
        httpd_register_uri_handler(api_httpd, &level_uri);
        httpd_register_uri_handler(api_httpd, &reboot_uri);
        httpd_register_uri_handler(api_httpd, &refill_uri);
        httpd_register_uri_handler(api_httpd, &update_sched_uri);
    }

    // --- SERVER 2: VIDEO STREAM (Port 81) ---
    config.server_port = 81;
    config.ctrl_port = 81;
    httpd_uri_t stream_uri = { .uri = "/stream", .method = HTTP_GET, .handler = stream_handler, .user_ctx = NULL };
    
    if (httpd_start(&stream_httpd, &config) == ESP_OK) {
        httpd_register_uri_handler(stream_httpd, &stream_uri);
    }
}
