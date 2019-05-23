
(function(l, i, v, e) { v = l.createElement(i); v.async = 1; v.src = '//' + (location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; e = l.getElementsByTagName(i)[0]; e.parentNode.insertBefore(v, e)})(document, 'script');
var app = (function () {
	'use strict';

	function noop() {}

	function add_location(element, file, line, column, char) {
		element.__svelte_meta = {
			loc: { file, line, column, char }
		};
	}

	function run(fn) {
		return fn();
	}

	function blank_object() {
		return Object.create(null);
	}

	function run_all(fns) {
		fns.forEach(run);
	}

	function is_function(thing) {
		return typeof thing === 'function';
	}

	function safe_not_equal(a, b) {
		return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
	}

	function append(target, node) {
		target.appendChild(node);
	}

	function insert(target, node, anchor) {
		target.insertBefore(node, anchor || null);
	}

	function detach(node) {
		node.parentNode.removeChild(node);
	}

	function element(name) {
		return document.createElement(name);
	}

	function text(data) {
		return document.createTextNode(data);
	}

	function space() {
		return text(' ');
	}

	function listen(node, event, handler, options) {
		node.addEventListener(event, handler, options);
		return () => node.removeEventListener(event, handler, options);
	}

	function attr(node, attribute, value) {
		if (value == null) node.removeAttribute(attribute);
		else node.setAttribute(attribute, value);
	}

	function children(element) {
		return Array.from(element.childNodes);
	}

	function set_data(text, data) {
		data = '' + data;
		if (text.data !== data) text.data = data;
	}

	let current_component;

	function set_current_component(component) {
		current_component = component;
	}

	const dirty_components = [];

	const resolved_promise = Promise.resolve();
	let update_scheduled = false;
	const binding_callbacks = [];
	const render_callbacks = [];
	const flush_callbacks = [];

	function schedule_update() {
		if (!update_scheduled) {
			update_scheduled = true;
			resolved_promise.then(flush);
		}
	}

	function add_render_callback(fn) {
		render_callbacks.push(fn);
	}

	function flush() {
		const seen_callbacks = new Set();

		do {
			// first, call beforeUpdate functions
			// and update components
			while (dirty_components.length) {
				const component = dirty_components.shift();
				set_current_component(component);
				update(component.$$);
			}

			while (binding_callbacks.length) binding_callbacks.shift()();

			// then, once components are updated, call
			// afterUpdate functions. This may cause
			// subsequent updates...
			while (render_callbacks.length) {
				const callback = render_callbacks.pop();
				if (!seen_callbacks.has(callback)) {
					callback();

					// ...so guard against infinite loops
					seen_callbacks.add(callback);
				}
			}
		} while (dirty_components.length);

		while (flush_callbacks.length) {
			flush_callbacks.pop()();
		}

		update_scheduled = false;
	}

	function update($$) {
		if ($$.fragment) {
			$$.update($$.dirty);
			run_all($$.before_render);
			$$.fragment.p($$.dirty, $$.ctx);
			$$.dirty = null;

			$$.after_render.forEach(add_render_callback);
		}
	}

	function mount_component(component, target, anchor) {
		const { fragment, on_mount, on_destroy, after_render } = component.$$;

		fragment.m(target, anchor);

		// onMount happens after the initial afterUpdate. Because
		// afterUpdate callbacks happen in reverse order (inner first)
		// we schedule onMount callbacks before afterUpdate callbacks
		add_render_callback(() => {
			const new_on_destroy = on_mount.map(run).filter(is_function);
			if (on_destroy) {
				on_destroy.push(...new_on_destroy);
			} else {
				// Edge case - component was destroyed immediately,
				// most likely as a result of a binding initialising
				run_all(new_on_destroy);
			}
			component.$$.on_mount = [];
		});

		after_render.forEach(add_render_callback);
	}

	function destroy(component, detaching) {
		if (component.$$) {
			run_all(component.$$.on_destroy);
			component.$$.fragment.d(detaching);

			// TODO null out other refs, including component.$$ (but need to
			// preserve final state?)
			component.$$.on_destroy = component.$$.fragment = null;
			component.$$.ctx = {};
		}
	}

	function make_dirty(component, key) {
		if (!component.$$.dirty) {
			dirty_components.push(component);
			schedule_update();
			component.$$.dirty = blank_object();
		}
		component.$$.dirty[key] = true;
	}

	function init(component, options, instance, create_fragment, not_equal$$1, prop_names) {
		const parent_component = current_component;
		set_current_component(component);

		const props = options.props || {};

		const $$ = component.$$ = {
			fragment: null,
			ctx: null,

			// state
			props: prop_names,
			update: noop,
			not_equal: not_equal$$1,
			bound: blank_object(),

			// lifecycle
			on_mount: [],
			on_destroy: [],
			before_render: [],
			after_render: [],
			context: new Map(parent_component ? parent_component.$$.context : []),

			// everything else
			callbacks: blank_object(),
			dirty: null
		};

		let ready = false;

		$$.ctx = instance
			? instance(component, props, (key, value) => {
				if ($$.ctx && not_equal$$1($$.ctx[key], $$.ctx[key] = value)) {
					if ($$.bound[key]) $$.bound[key](value);
					if (ready) make_dirty(component, key);
				}
			})
			: props;

		$$.update();
		ready = true;
		run_all($$.before_render);
		$$.fragment = create_fragment($$.ctx);

		if (options.target) {
			if (options.hydrate) {
				$$.fragment.l(children(options.target));
			} else {
				$$.fragment.c();
			}

			if (options.intro && component.$$.fragment.i) component.$$.fragment.i();
			mount_component(component, options.target, options.anchor);
			flush();
		}

		set_current_component(parent_component);
	}

	class SvelteComponent {
		$destroy() {
			destroy(this, true);
			this.$destroy = noop;
		}

		$on(type, callback) {
			const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
			callbacks.push(callback);

			return () => {
				const index = callbacks.indexOf(callback);
				if (index !== -1) callbacks.splice(index, 1);
			};
		}

		$set() {
			// overridden by instance, if it has props
		}
	}

	class SvelteComponentDev extends SvelteComponent {
		constructor(options) {
			if (!options || (!options.target && !options.$$inline)) {
				throw new Error(`'target' is a required option`);
			}

			super();
		}

		$destroy() {
			super.$destroy();
			this.$destroy = () => {
				console.warn(`Component was already destroyed`); // eslint-disable-line no-console
			};
		}
	}

	/* src\ContactCard.svelte generated by Svelte v3.4.2 */

	const file = "src\\ContactCard.svelte";

	function create_fragment(ctx) {
		var div3, header, div0, img, t0, div1, h1, t2, h2, t4, div2, p;

		return {
			c: function create() {
				div3 = element("div");
				header = element("header");
				div0 = element("div");
				img = element("img");
				t0 = space();
				div1 = element("div");
				h1 = element("h1");
				h1.textContent = "User Name";
				t2 = space();
				h2 = element("h2");
				h2.textContent = "Job Title";
				t4 = space();
				div2 = element("div");
				p = element("p");
				p.textContent = "A short description";
				img.src = "";
				img.alt = "";
				add_location(img, file, 8, 2, 55);
				add_location(div0, file, 7, 2, 46);
				add_location(h1, file, 11, 3, 99);
				add_location(h2, file, 12, 2, 121);
				add_location(div1, file, 10, 2, 89);
				add_location(header, file, 6, 2, 34);
				add_location(p, file, 17, 2, 178);
				add_location(div2, file, 16, 2, 169);
				add_location(div3, file, 5, 0, 25);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, div3, anchor);
				append(div3, header);
				append(header, div0);
				append(div0, img);
				append(header, t0);
				append(header, div1);
				append(div1, h1);
				append(div1, t2);
				append(div1, h2);
				append(div3, t4);
				append(div3, div2);
				append(div2, p);
			},

			p: noop,
			i: noop,
			o: noop,

			d: function destroy(detaching) {
				if (detaching) {
					detach(div3);
				}
			}
		};
	}

	class ContactCard extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, null, create_fragment, safe_not_equal, []);
		}
	}

	/* src\App.svelte generated by Svelte v3.4.2 */

	const file$1 = "src\\App.svelte";

	function create_fragment$1(ctx) {
		var h1, t0, t1, t2, t3, t4, t5, button, t7, input, t8, current, dispose;

		var contactcard = new ContactCard({ $$inline: true });

		return {
			c: function create() {
				h1 = element("h1");
				t0 = text("Hello ");
				t1 = text(ctx.uppercaseName);
				t2 = text(", my age is ");
				t3 = text(ctx.age);
				t4 = text("!");
				t5 = space();
				button = element("button");
				button.textContent = "Change Age";
				t7 = space();
				input = element("input");
				t8 = space();
				contactcard.$$.fragment.c();
				h1.className = "svelte-i7qo5m";
				add_location(h1, file$1, 37, 0, 448);
				add_location(button, file$1, 38, 0, 497);
				attr(input, "type", "text");
				add_location(input, file$1, 41, 0, 683);

				dispose = [
					listen(button, "click", ctx.incrementAge),
					listen(input, "input", ctx.input_input_handler)
				];
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, h1, anchor);
				append(h1, t0);
				append(h1, t1);
				append(h1, t2);
				append(h1, t3);
				append(h1, t4);
				insert(target, t5, anchor);
				insert(target, button, anchor);
				insert(target, t7, anchor);
				insert(target, input, anchor);

				input.value = ctx.name;

				insert(target, t8, anchor);
				mount_component(contactcard, target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				if (!current || changed.uppercaseName) {
					set_data(t1, ctx.uppercaseName);
				}

				if (!current || changed.age) {
					set_data(t3, ctx.age);
				}

				if (changed.name && (input.value !== ctx.name)) input.value = ctx.name;
			},

			i: function intro(local) {
				if (current) return;
				contactcard.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				contactcard.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(h1);
					detach(t5);
					detach(button);
					detach(t7);
					detach(input);
					detach(t8);
				}

				contactcard.$destroy(detaching);

				run_all(dispose);
			}
		};
	}

	function instance($$self, $$props, $$invalidate) {
		let name = 'Josh';
		let age = 22;


		function incrementAge() {
			$$invalidate('age', age += 1);
		}

		function input_input_handler() {
			name = this.value;
			$$invalidate('name', name);
		}

		let uppercaseName;

		$$self.$$.update = ($$dirty = { name: 1 }) => {
			if ($$dirty.name) { $$invalidate('uppercaseName', uppercaseName = name.toUpperCase()); }
			if ($$dirty.name) { console.log(name); }
			if ($$dirty.name) { if (name === 'Joshua') {
					$$invalidate('age', age = 30);
				} }
		};

		return {
			name,
			age,
			incrementAge,
			uppercaseName,
			input_input_handler
		};
	}

	class App extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance, create_fragment$1, safe_not_equal, []);
		}
	}

	const app = new App({
		target: document.body
	});

	return app;

}());
//# sourceMappingURL=bundle.js.map
