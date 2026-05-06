// =====================================================================
// supabase-client.js — Supabase wiring for Yasin Dashboard
// =====================================================================
// Loads the Supabase JS library from CDN, initialises a client, and
// exposes globals used by other modules.
//
// Globals exposed:
//   window.sb              — the Supabase client (or null if offline/blocked)
//   window.sbReady         — Promise that resolves once the client is ready
//   window.sbAuth          — { user, householdId } (null until logged in)
//   window.sbSignIn(email, password)
//   window.sbSignOut()
//   window.sbOnAuthChange(cb)  — register a callback for login/logout
// =====================================================================

(function(){
  'use strict';

  // ---- CONFIG --------------------------------------------------------
  var SUPABASE_URL  = 'https://ckfyoseefjydrnfntgkx.supabase.co';
  var SUPABASE_KEY  = 'sb_publishable_D5VPMwkhNdNsYMZjueKj8A_OBVnlbYQ';
  var CDN_URL       = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

  // ---- STATE ---------------------------------------------------------
  window.sb = null;
  window.sbAuth = null;
  var authListeners = [];

  // ---- LOAD SDK ------------------------------------------------------
  function loadScript(src){
    return new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function(){ resolve(); };
      s.onerror = function(){ reject(new Error('Failed to load '+src)); };
      document.head.appendChild(s);
    });
  }

  function notifyAuthChange(){
    for(var i=0;i<authListeners.length;i++){
      try{ authListeners[i](window.sbAuth); }catch(e){ console.warn('auth listener error', e); }
    }
  }

  async function loadHouseholdId(){
    if(!window.sb || !window.sbAuth) return null;
    try {
      var res = await window.sb
        .from('household_members')
        .select('household_id')
        .eq('user_id', window.sbAuth.user.id)
        .maybeSingle();
      if(res.error){ console.warn('household lookup error', res.error); return null; }
      if(res.data){
        window.sbAuth.householdId = res.data.household_id;
        return res.data.household_id;
      }
    } catch(e){ console.warn('household lookup failed', e); }
    return null;
  }

  async function init(){
    try {
      await loadScript(CDN_URL);
    } catch(e){
      console.warn('[supabase] SDK failed to load (offline or blocked). App stays in local-only mode.');
      return null;
    }

    if(!window.supabase || typeof window.supabase.createClient !== 'function'){
      console.warn('[supabase] global not present after load');
      return null;
    }

    var client;
    try {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: 'yb_supabase_auth_v1'
        }
      });
    } catch(e){
      console.warn('[supabase] createClient threw', e);
      return null;
    }

    window.sb = client;

    // Restore session if one exists in localStorage
    try {
      var sess = await client.auth.getSession();
      if(sess && sess.data && sess.data.session){
        window.sbAuth = { user: sess.data.session.user, householdId: null };
        await loadHouseholdId();
        notifyAuthChange();
      }
    } catch(e){ console.warn('[supabase] getSession failed', e); }

    // Watch for sign-in / sign-out events
    client.auth.onAuthStateChange(async function(event, session){
      if(session && session.user){
        window.sbAuth = { user: session.user, householdId: null };
        await loadHouseholdId();
      } else {
        window.sbAuth = null;
      }
      notifyAuthChange();
    });

    console.log('[supabase] client ready');
    return client;
  }

  // ---- PUBLIC API ----------------------------------------------------
  window.sbReady = init();

  window.sbSignIn = async function(email, password){
    await window.sbReady;
    if(!window.sb) throw new Error('Supabase unavailable');
    var res = await window.sb.auth.signInWithPassword({ email: email, password: password });
    if(res.error) throw res.error;
    return res.data;
  };

  window.sbSignOut = async function(){
    await window.sbReady;
    if(!window.sb) return;
    await window.sb.auth.signOut();
  };

  window.sbOnAuthChange = function(cb){
    if(typeof cb !== 'function') return;
    authListeners.push(cb);
    // Fire immediately with current state so listeners can sync
    try{ cb(window.sbAuth); }catch(e){}
  };

  // Convenience helper — returns the household_id or throws if not logged in
  window.sbHouseholdId = function(){
    if(!window.sbAuth || !window.sbAuth.householdId){
      throw new Error('Not logged in to a household');
    }
    return window.sbAuth.householdId;
  };
})();
