// Internationalization : Stardew Valley Mod Translation Tool
const el = {};
const info = {};
const iso639_1 = {};

// Translation json parser.
const magic = new RegExp([
	/(?:(?<key1>[_a-z][_a-z0-9]*)|"(?<key2>.*?)(?<!\\(?:\\\\)+)")(?<colon>\s*:\s*)"(?<value>.*?)(?<!\\(?:\\\\)+)"/, // entry
	/\/\/(?<sc>.*)/,      // Single line comment
	/\/\*(?<mc>[^]*?)\*\//, // Multiline comment
].map((x)=>x.source).join('|'), "dgiu");

// Request mod list
Promise.all([
	fetch("/info").then(as_json).then((res) => Object.assign(info, res)),
	fetch("/static/iso639-1.json").then(as_json).then((res) => Object.assign(iso639_1, res)),
	content_loaded
]).then(ready);

/** Returns an array containing all elements matched by the given XPath expression. */
function $(a, root) {
	const res = document.evaluate(a,root ?? document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
	return [...gen()];
	function* gen() {
		for (let i=0; i<res.snapshotLength; i++) yield res.snapshotItem(i);
	}
}

/** Create a new element */
function node(nodeType, pars){
	const e = document.createElement(nodeType);
	for (const p in pars) {
		if (p=="text") e.appendChild(text(pars[p]));
		else e.setAttribute(p,pars[p]);
	}
	return e;
}

/** Create a text node */
function text(content) {
	return document.createTextNode(content);
}

function is_ok(res) {if(!res.ok) throw res;}
function as_text(res) {is_ok(res); return res.text();}
function as_json(res) {is_ok(res); return res.json();}

/** Modify textarea to fit contents. Must be part of document to work. */
function textarea_fit(e) {
	e.style.height = "1lh";
	e.style.height = (e.scrollHeight-4)+"px";
}

/** 
 * Like Array.prototype.map, but for objects.
 * Takes an additional argument to determine sorting order.
 * Both cmp_prop and fn have the signature function(element, index, object).
 * @param cmp_prop function that returns a object used as sorting key.
 * @param fn function that is executed for each element.
 * @returns An array of the values returned by fn.
 */
function sort_and_map(object, cmp_prop, fn) {
	const keys = Object.getOwnPropertyNames(object);
	if (cmp_prop) keys.sort(cmp);
	return keys.map( (x) => fn(object[x],x,object) );
	
	function cmp(a,b) {
		const aa = cmp_prop(object[a],a,object);
		const bb = cmp_prop(object[b],b,object);
		if (aa < bb) return -1;
		if (aa > bb) return  1;
		return 0;
	}
}

/** Returns the selected option for a given <select> element. */
function current_option(element) {
	return element.options[element.selectedIndex];
}

/** Causse a <select> to copy its css-class from the selected option. */
function copy_style_from_option(element) {
	console.log(typeof(element));
	if (element.target) element = element.target;
	element.className = current_option(element).className
}

/** Initialize the web app */
function ready() {
	// Map id to their html element
	for (const e of $("//*[@id]")) el[e.id.replaceAll("-","_")] = e;

	// Update textboxes to fit content on window resize.	
	window.addEventListener("resize", () => {
		for (const x of $("//textarea")) textarea_fit(x);
	});
	
	// Populate mod picker.
	const mod_options = sort_and_map(info.mods, (x)=>x.name, (mod,id) => node("option", {value:id, text: mod.name}));
	el.mod.replaceChildren(...mod_options);
	el.mod.value = localStorage.getItem("modid"); // Select last mod
	el.mod.addEventListener('change', update_mod);
	el.mod.addEventListener('change', copy_style_from_option);

	// Populate locale picker.
	const locale_options = sort_and_map(info.locales, (_,id)=>iso639_1[id], locale_option);
	el.locale.replaceChildren(...locale_options);
	el.locale.value = localStorage.getItem("locale") ?? info.current_locale; // Select previous locale
	el.locale.addEventListener('change', update_locale);
	el.locale.addEventListener('change', copy_style_from_option);
	
	// Configure current locale button
	el.current.replaceChildren(text(iso639_1[info.current_locale]));
	el.current.addEventListener('click', function(){
		el.locale.value = info.current_locale;
		update_locale();
	});

	update_mod();
	
	function locale_option(entry, id) {
		const res = node("option", {value:id, text:iso639_1[id]})
		if (entry.modname) {
			res.setAttribute("title", entry.modname);
		}
		return res;
	}
	
	function status(id) {
		const loc = info.current_locale;
	}
}

/** Load the mod's translation file into the editor */
function update_mod() {
	const modid = el.mod.value;
	localStorage.setItem("modid", modid);
	
	// Update what locale availability for selected mod
	for (const loc of $("./option", el.locale)) {
		set_translation_status(loc, modid, loc.value);
	}
	copy_style_from_option(el.locale);
	
	const text_new = fetch("/file/" + modid + "/default").then(as_text).then((text_new) => {
		// Generate the translation editor for this mod
		el.new.replaceChildren(...generate_editor(text_new));
		el.new.dataset.raw = text_new;
	}).then(
		// Load the selected locale
		update_locale
	);
}

function* generate_editor(content, readonly) {
	let pos = 0;
	for (const m of content.matchAll(magic)) {
		const g = m.groups;
		if (g.sc) yield node("div", {'class': "comment", text: g.sc});
		if (g.mc) yield node("div", {'class': "comment", text: g.mc});
		if (g.key1 || g.key2) {
			const r = node("div", {'class': "entry"});
			const key = g.key1 ?? g.key2;
			let field;
			if (readonly) {
				r.replaceChildren(
					node("span", {'class': "key", text: key}),
					node("span", {'class': "default", "data-key": key}),
					field = node("textarea", {'class': "value", text: g.value, readonly:""}),
				);
				field.addEventListener('focus', (e)=>e.target.select());
			} else {
				r.replaceChildren(
					node("span", {'class': "key", text: key}),
					node("span", {'class': "default", text: g.value}),
					field = node("textarea", {'class': "value", "data-key": key, "data-position":m.indices.groups.value}),
				);
				field.addEventListener('input', (e)=>textarea_fit(e.target));
				field.addEventListener('change', (e)=>set_text(e.target.dataset.key, e.target.value));
			}
			r.addEventListener('click', ()=>field.focus());
			yield r;
		}
		pos = m.index + m[0].length;
	}
}

/** Load the selected locale into the editor. */
async function update_locale() {
	const modid = el.mod.value;
	const locale = el.locale.value;
	localStorage.setItem("locale", locale);

	// Load current translation from game
	fetch("/lang/" + el.mod.value + "/" + locale).then(as_json).catch((x)=>Promise.resolve({})).then(
	(lang) => {
		for (const e of $('.//*[@data-key]', el.new)) {
			e.replaceChildren(text(lang[e.dataset.key] ?? ""));
			textarea_fit(e);
		}
	}).catch((e)=>console.log(e));
	
	// Generate old translation contents
	fetch("/file/" + modid + "/" + locale).then(as_text).catch((x)=>Promise.resolve("")).then(
	(text_old) => {
		el.old.replaceChildren(...generate_editor(text_old, true));
		for (const x of $(".//textarea", el.old)) textarea_fit(x);
		fetch("/lang/" + el.mod.value + "/default").then(as_json).then(
		(lang) => {
			if (!lang) return;
			for (const e of $('.//*[@data-key]', el.old)) {
				e.replaceChildren(text(lang[e.dataset.key] ?? ""));
			}
		});	
	});
	
	// Update what mods have the current locale available
	for (const mod of $("./option", el.mod)) {
		set_translation_status(mod, mod.value, locale);
	}
	copy_style_from_option(el.mod);
}

/** Updates a text in game for the current mod & locale. */
function set_text(text_id, value) {
	const mod = el.mod.value;
	const locale = el.locale.value;
	const content = { method: "PUT", body: value };
	fetch("/lang/"+mod+"/"+locale+"/"+text_id, content);
	mark_modified(mod, locale, true);
}

function set_translation_status(element, mod, locale) {
	const mod_info = info.mods[mod];
	const locale_info = mod_info.locales[locale];
	element.className = "";
	if (locale_info) {
		if (locale_info.modified) {
			element.classList.add("modified");
		}
		if (locale_info.lines_translated < mod_info.lines_total) {
			element.classList.add("partial");
		} else {
			element.classList.add("complete");
		}
	} else {
		element.classList.add("missing");
	}	
}

/** Sets the modified flag for the given mod & locale. */
function mark_modified(mod, locale, status) {
	const locales = info.mods[mod].locales;
	if (locales[locale] && locales[locale].modified == status) return; // Nothing changed.
	
	// Set the new status
	if (locales[locale]) {
		locales[locale].modified = status;
	} else {
		locales[locale] = {
			modified: status,
			lines_translated: 0
		};
	}
	
	// Update the selection boxes formatting.
	set_translation_status(current_option(el.mod), mod, locale);
	set_translation_status(current_option(el.locale), mod, locale);
	copy_style_from_option(el.mod);
	copy_style_from_option(el.locale);
}