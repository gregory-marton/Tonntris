/*
@licstart  The following is the entire license notice for the
JavaScript code in this file.

Copyright (C) 2026  Gregory Marton

The JavaScript code in this file is free software: you can
redistribute it and/or modify it under the terms of the GNU
General Public License (GNU GPL) as published by the Free Software
Foundation, either version 3 of the License, or (at your option)
any later version.  The code is distributed WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE.  See the GNU GPL for more details.

As additional permission under GNU GPL version 3 section 7, you
may distribute non-source (e.g., minimized or compacted) forms of
that code without the copy of the GNU GPL normally required by
section 4, provided you include this license notice and a URL
through which recipients can access the Corresponding Source.

@licend  The above is the entire license notice
for the JavaScript code in this file.
*/
/**
 * midi-folder.js - Local MIDI folder source for Melody mode (task #27), replacing the plain
 * <input type=file> upload picker with a folder the player sets once and browses via a dropdown.
 *
 * Chrome-only progressive enhancement: uses the File System Access API
 * (window.showDirectoryPicker), which Safari/Firefox don't implement, matching the same
 * Chrome-only precedent already established for Web MIDI (js/midi-input.js). Unsupported
 * browsers keep the exact original upload-picker UI/behavior -- #midi-upload-group stays
 * visible and #midi-folder-group stays hidden, untouched by anything in this file.
 *
 * The chosen FileSystemDirectoryHandle is itself structured-cloneable (a deliberate part of the
 * API's design, specifically to support "remember this folder across sessions" -- unlike plain
 * objects, real handles survive an IndexedDB round-trip), so it's persisted directly rather than
 * remembering a path string and re-resolving it. Browser permission for a remembered handle can
 * still lapse between sessions -- queryPermission() reports this, and re-granting
 * (requestPermission()) requires a user gesture, so a lapsed permission surfaces as a one-click
 * "reconnect" affordance rather than silently failing or re-showing the full picker.
 */
const MidiFolder = {
    DB_NAME: 'tonncade_midi_folder',
    STORE_NAME: 'handles',
    HANDLE_KEY: 'folder',

    isSupported: function() {
        return typeof window !== 'undefined' && !!window.showDirectoryPicker;
    },

    openDB: function() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore(this.STORE_NAME);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    saveHandle: async function(handle) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).put(handle, this.HANDLE_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    loadHandle: async function() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const req = tx.objectStore(this.STORE_NAME).get(this.HANDLE_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    },

    // Wires the folder UI and attempts to restore a previously-chosen folder. Called once from
    // MidiMode.setupDOMEvents with the MidiMode instance itself (so this module never needs to
    // know MidiMode's internals beyond the one shared entrypoint, loadMelodyFromArrayBuffer).
    setup: async function(midiMode) {
        this.midiMode = midiMode;
        const uploadGroup = document.getElementById('midi-upload-group');
        const folderGroup = document.getElementById('midi-folder-group');
        if (!folderGroup) return;

        if (!this.isSupported()) {
            folderGroup.style.display = 'none';
            return;
        }

        if (uploadGroup) uploadGroup.style.display = 'none';
        folderGroup.style.display = '';

        const chooseBtn = document.getElementById('midi-choose-folder-btn');
        const select = document.getElementById('midi-folder-files');
        if (chooseBtn) chooseBtn.onclick = () => this.chooseFolder();
        if (select) select.onchange = () => this.loadSelectedFile();

        await this.restore();
    },

    chooseFolder: async function() {
        let handle;
        try {
            handle = await window.showDirectoryPicker();
        } catch (err) {
            // AbortError: the player closed the picker without choosing anything -- expected,
            // not worth logging.
            if (err && err.name !== 'AbortError') console.warn('MIDI folder selection failed:', err);
            return;
        }

        // Persisting the handle (so next visit can skip re-picking) is a nice-to-have, separate
        // from actually being able to use the folder THIS session -- a quota/storage failure
        // here shouldn't block browsing the songs the player just picked.
        try {
            await this.saveHandle(handle);
        } catch (err) {
            console.warn('Could not remember this MIDI folder for next time:', err);
        }

        await this.listFiles(handle);
    },

    // Attempts to silently pick back up a folder chosen in an earlier session. A granted
    // permission survives quietly; a lapsed one needs a single user-gesture click to re-grant
    // (browsers require this for security -- silently re-requesting isn't possible).
    restore: async function() {
        let handle;
        try {
            handle = await this.loadHandle();
        } catch (err) {
            console.warn('Could not read a saved MIDI folder:', err);
            return;
        }
        if (!handle) return;

        const permission = await handle.queryPermission({ mode: 'read' });
        if (permission === 'granted') {
            await this.listFiles(handle);
        } else {
            this.showReconnect(handle);
        }
    },

    showReconnect: function(handle) {
        const status = document.getElementById('midi-folder-status');
        const chooseBtn = document.getElementById('midi-choose-folder-btn');
        if (status) status.textContent = `Reconnect "${handle.name}"`;
        if (chooseBtn) {
            chooseBtn.textContent = 'Reconnect Folder';
            chooseBtn.onclick = async () => {
                const permission = await handle.requestPermission({ mode: 'read' });
                if (permission === 'granted') {
                    await this.listFiles(handle);
                }
            };
        }
    },

    listFiles: async function(handle) {
        this.folderHandle = handle;
        const files = [];
        for await (const entry of handle.values()) {
            if (entry.kind === 'file' && /\.midi?$/i.test(entry.name)) {
                files.push(entry);
            }
        }
        files.sort((a, b) => a.name.localeCompare(b.name));
        this.fileHandles = files;

        const select = document.getElementById('midi-folder-files');
        const status = document.getElementById('midi-folder-status');
        const chooseBtn = document.getElementById('midi-choose-folder-btn');
        if (chooseBtn) {
            chooseBtn.textContent = 'Change Folder';
            chooseBtn.onclick = () => this.chooseFolder(); // restores normal behavior after a reconnect
        }
        if (status) status.textContent = `${handle.name} (${files.length} song${files.length === 1 ? '' : 's'})`;

        if (select) {
            select.innerHTML = '';
            files.forEach((f, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = f.name.replace(/\.midi?$/i, '');
                select.appendChild(opt);
            });
            select.style.display = files.length > 0 ? '' : 'none';
        }

        if (files.length > 0) {
            await this.loadFileAt(0);
        }
    },

    loadSelectedFile: function() {
        const select = document.getElementById('midi-folder-files');
        if (!select) return Promise.resolve();
        return this.loadFileAt(parseInt(select.value, 10));
    },

    loadFileAt: async function(index) {
        const entry = this.fileHandles && this.fileHandles[index];
        if (!entry) return;
        const file = await entry.getFile();
        const buffer = await file.arrayBuffer();
        this.midiMode.loadMelodyFromArrayBuffer(buffer, file.name);
    },
};
