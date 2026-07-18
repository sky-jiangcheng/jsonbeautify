/* ========== Mobile Detect & Debug ========== */
/* Runs early to set body.mobile class and enable debug overlay */

(function(){
    if(document.documentElement.getAttribute("data-device")==="mobile") {
        document.body.classList.add("mobile");
    }
})();
