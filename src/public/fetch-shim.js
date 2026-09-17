// The fetch shim from the Supabase fetch fix: strips the init options that the
// renderer's fetch cannot carry through to Electron's net layer. It has to run
// before the bundle, and it lives in a file of its own because the production
// Content-Security-Policy allows no inline script.
(function(){
      var _orig=window.fetch.bind(window);
      var STRIP=['referrerPolicy','referrer','mode','cache','credentials','redirect','priority','duplex'];
      window.fetch=function(url,init){
        if(init&&typeof init==='object'){
          var opts=Object.assign({},init);
          STRIP.forEach(function(k){delete opts[k];});
          return _orig(url,opts);
        }
        return _orig(url,init);
      };
    })();
