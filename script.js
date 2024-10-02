"use strict";

//constants

const DB = idbKeyval;
const MB_TAX = 0.05;

const UNIVERSALIS = {
  CON: 8,
  SEC: 25,
  MAX: 999999,
  LIM: 100
};

const XIVAPI = { LIM: 500 };

const CRAFTER = {
  ALCHEMIST: 6,
  ARMORER: 2,
  BLACKSMITH: 1,
  CARPENTER: 0,
  CULINARIAN: 7,
  GOLDSMITH: 3,
  LEATHERWORKER: 4,
  WEAVER: 5
};

const WORLD = {
  ADAMANTOISE: 73,
  CACTUAR: 79,
  FAERIE: 54,
  GILGAMESH: 63,
  JENOVA: 40,
  MIDGARDSORMR: 65,
  SARGATANAS: 99,
  SIREN: 57
};

const PAGE_SIZE = 100;

const SORT = {
  LEVEL: 1,
  VALUE_07_HQ: 2,
  VALUE_07_NQ: 3,
  VALUE_30_HQ: 4,
  VALUE_30_NQ: 5
};

const VIEW = {
  ALL: 1,
  SELECTED: 2
};

//global variables

var unrecoverable = false;

var ff14_hard_refresh = async () => {
  await DB.clear();
  localStorage.clear();
  location.reload();
};

console.log("If you experience issues, please call ff14_hard_refresh() from the browser console before reporting a bug.");

//utilities

const get_nested = (obj, path) => path.split(".").reduce((sub_obj, key) => sub_obj[key], obj);

const n_days_ago = (n, abs = true, date = Date.now()) => ((s = n * 24 * 60 * 60) => abs ? s : date / 1000 - s)();

const init_pause = (n) => (m = 1000 / n) => new Promise((r) => setTimeout(r, m));

const print_n = (n) => Math.round(n).toLocaleString();

const clean_copy = (obj) => JSON.parse(JSON.stringify(obj));

//apis

const get_recipe_by_page = (page) => {
  const fields = ["AmountIngredient", "AmountResult", "Ingredient[].Name", "ItemResult.Name", "RecipeLevelTable.ClassJobLevel", "SecretRecipeBook.Name"];
  const id = CRAFTER[localStorage.ff14_crafter.toUpperCase()];
  const query = `${encodeURIComponent("+")}CraftType=${id}${encodeURIComponent(" ")}-RecipeLevelTable.ClassJobLevel=0`;
  const params = `?fields=${fields}&limit=${XIVAPI.LIM}${page ? `&cursor=${page}` : `&query=${query}&sheets=Recipe`}`;

  return fetch(`https://beta.xivapi.com/api/1/search${params}`).then((r) => r.json());
};

const get_record_by_list = (list) => {
  const id = WORLD[localStorage.ff14_world.toUpperCase()];
  const params = `?entriesToReturn=${UNIVERSALIS.MAX}&entriesWithin=${n_days_ago(30)}`;

  return fetch(`https://universalis.app/api/v2/history/${id}/${list}${params}`).then((r) => r.json());
}

const init_load_data = (fn_call, fn_done = () => {}) => {
  const load_data = async (args, tries = 3) => {
    try {
      const data = await fn_call(...args);

      fn_done();

      return data;
    } catch (error) {
      if (unrecoverable) {
        return;
      }

      console.error(error);

      if (--tries) {
        return load_data(args, tries);
      } else {
        unrecoverable = true;

        if (confirm("A fatal error occurred.")) {
          location.reload();
        }
      }
    }
  };

  return load_data;
};

//selectors

const dom_date_updated = document.querySelector(".js-date-updated");
const dom_loading_bar = document.querySelector(".js-toggle-loading-bar");
const dom_page_next = document.querySelector(".js-click-page-next");
const dom_page_previous = document.querySelector(".js-click-page-previous");
const dom_refresh = document.querySelector(".js-click-refresh");
const dom_search = document.querySelector(".js-input-search");
const dom_select_crafter = document.querySelector(".js-change-crafter");
const dom_select_world = document.querySelector(".js-change-world");
const dom_table = document.querySelector(".js-toggle-table");
const dom_view_all = document.querySelector(".js-click-view-all");
const dom_view_selected = document.querySelector(".js-click-view-selected");

//store

const store = (() => {
  const state = {
    loaded: {
      current: 0,
      total: 0
    },
    page: 0,
    recipes: [],
    search: "",
    sort: 0,
    view: 0
  };

  const watchers = {
    loaded: {
      current: [],
      total: []
    },
    page: [],
    recipes: [],
    recipes_selected: [], //special case
    search: [],
    sort: [],
    view: []
  };

  const call = (path, ...data) => { get_nested(watchers, path).forEach((fn) => fn(...data)); };

  const methods = {
    add_loaded_current: (fn) => { watchers.loaded.current.push(fn) },
    add_loaded_total: (fn) => { watchers.loaded.total.push(fn); },
    add_page: (fn) => { watchers.page.push(fn); },
    add_recipes: (fn) => { watchers.recipes.push(fn); },
    add_recipes_selected: (fn) => { watchers.recipes_selected.push(fn); },
    add_search: (fn) => { watchers.search.push(fn); },
    add_sort: (fn) => { watchers.sort.push(fn); },
    add_view: (fn) => { watchers.view.push(fn); },

    get_loaded_current: () => state.loaded.current,
    get_loaded_total: () => state.loaded.total,
    get_page: () => state.page,
    get_recipes: () => clean_copy(state.recipes),
    get_recipes_selected: (id) => state.recipes.find((recipe) => recipe.id === id).selected,
    get_search: () => state.search,
    get_sort: () => state.sort,
    get_view: () => state.view,

    set_loaded_current: (current) => { state.loaded.current = current; call("loaded.current", current); },
    set_loaded_total: (total) => { state.loaded.total = total; call("loaded.total", total); },
    set_page: (page) => { state.page = page; call("page", page); },
    set_recipes: (recipes) => { state.recipes = recipes; call("recipes", clean_copy(state.recipes)); },
    set_recipes_selected: (id, selected) => { state.recipes.find((recipe) => recipe.id === id).selected = selected; call("recipes_selected", id, selected); },
    set_search: (search) => { state.search = search; call("search", search) },
    set_sort: (sort) => { state.sort = sort; call("sort", sort); },
    set_view: (view) => { state.view = view; call("view", view); }
  };

  return methods;
})();

//data logic

const calc_mean = (list) => list.reduce((total, { price, qty }) => total + price * qty, 0) / list.reduce((total, { qty }) => total + qty, 0);

const calc_median = (list) => {
  const list_sorted = list.slice().sort(({ price: price_a }, { price: price_b }) => price_a - price_b);

  const [median_i, median_j] = ((median_k = list_sorted.reduce((total, { qty }) => total + qty, 0) / 2) => median_k % 1 ? [Math.ceil(median_k), 0] : [median_k, median_k + 1])();

  let price_last = 0;
  let total = 0;

  for (const { price, qty } of list_sorted) {
    if (median_i <= total + qty && median_j <= total + qty) {
      return total < median_i ? price : (price_last + price) / 2;
    } else {
      price_last = price;
      total += qty;
    }
  }
};

const calc_avg_cost = (ingredients) => (key) => ingredients.some((item) => !item[key]) ? 0 : ingredients.reduce((total, item) => total + item[key] * item.qty, 0);

const calc_avg_profit = (qty) => (cost) => (days) => (history) => {
  const data = { price: 0, profit: 0, profit_pc: 0, profit_pd: 0, qty, sold: 0, sold_ge: 0, sold_pc: 0 };

  if (history.length) {
    const mean = calc_mean(history);
    const sold = history.reduce((total, { qty }) => total + qty, 0);
    const sold_ge = history.reduce((total, { price, qty }) => total + (price >= mean ? qty : 0), 0);
    const sold_pc = sold_ge / sold * 100;

    Object.assign(data, { price: mean, sold, sold_ge, sold_pc });

    if (cost) {
      const income = mean * qty * (1 - MB_TAX);
      const profit = income - cost * (1 + MB_TAX);
      const profit_pc = profit / income * 100;
      const profit_pd = profit / qty * sold / days;

      Object.assign(data, { profit, profit_pc, profit_pd });
    }
  }

  return data;
};

const analyze_data = async () => {
  const crafter = localStorage.ff14_crafter;
  const recipes_selected = ((list = localStorage[`ff14_recipes_selected_${crafter}`]) => list ? JSON.parse(list) : [])();

  const ff14_recipes = await DB.get(`ff14_recipes_${crafter}`);
  const ff14_records = await DB.get(`ff14_records_${crafter}`);
  const date_updated = await DB.get(`ff14_records_${crafter}_updated`);
  const recipes = [];

  for (const [id, old_recipe] of Object.entries(ff14_recipes)) {
    const new_recipe = {
      id,
      ingredients: [],
      level: old_recipe.level,
      level_internal: old_recipe.level_internal,
      result: null,
      selected: ((recipe = (recipes_selected.find((recipe) => id === recipe.id))) => recipe ? recipe.selected : 0)(),
      source: old_recipe.source
    };

    const date_07 = n_days_ago(7, false, date_updated);

    new_recipe.ingredients = old_recipe.ingredients.map((item) => {
      const history_30 = ff14_records[item.id];
      const history_07 = history_30.filter((sale) => sale.date > date_07);

      return {
        name: item.name,
        past_07_days: calc_mean(history_07),
        past_30_days: calc_mean(history_30),
        qty: item.qty
      };
    });

    new_recipe.result = (() => {
      const history = ff14_records[old_recipe.result.id];

      const history_07_hq = history.filter((sale) => sale.date > date_07 && sale.hq);
      const history_07_nq = history.filter((sale) => sale.date > date_07 && !sale.hq);
      const history_30_hq = history.filter((sale) => sale.hq);
      const history_30_nq = history.filter((sale) => !sale.hq);

      const fn_cost = calc_avg_cost(new_recipe.ingredients);
      const fn_profit = calc_avg_profit(old_recipe.result.qty);

      const fn_profit_07 = fn_profit(fn_cost("past_07_days"))(7);
      const fn_profit_30 = fn_profit(fn_cost("past_30_days"))(30);

      return {
        name: old_recipe.result.name,
        past_07_days: {
          hq: fn_profit_07(history_07_hq),
          nq: fn_profit_07(history_07_nq)
        },
        past_30_days: {
          hq: fn_profit_30(history_30_hq),
          nq: fn_profit_30(history_30_nq)
        },
        qty: old_recipe.result.qty
      };
    })();

    recipes.push(new_recipe);
  }

  store.set_recipes(recipes);
};

const load_recipes = async () => {
  const crafter = localStorage.ff14_crafter;

  const ff14_recipes = await DB.get(`ff14_recipes_${crafter}`);

  if (ff14_recipes) { return; }

  const recipes = {};

  let next = null;

  const load_data = init_load_data(get_recipe_by_page);

  store.set_loaded_current(0);
  store.set_loaded_total(0);

  do {
    const page = await load_data([next]);

    next = page.next;

    for (const { fields, row_id } of page.results) {
      fields.Ingredient = fields.Ingredient.filter((item) => item.row_id);
      fields.AmountIngredient = fields.AmountIngredient.filter((n) => n);

      recipes[row_id] = {
        ingredients: fields.Ingredient.map((item, i) => ({
          id: item.row_id,
          name: item.fields.Name,
          qty: fields.AmountIngredient[i]
        })),
        level_internal: fields.RecipeLevelTable.value,
        level: fields.RecipeLevelTable.fields.ClassJobLevel,
        result: {
          id: fields.ItemResult.row_id,
          name: fields.ItemResult.fields.Name,
          qty: fields.AmountResult
        },
        source: fields.SecretRecipeBook.fields.Name
      };
    }
  } while (next);

  await DB.set(`ff14_recipes_${crafter}`, recipes);
};

const load_records = async () => {
  const crafter = localStorage.ff14_crafter;

  const ff14_records = await DB.get(`ff14_records_${crafter}`);

  if (ff14_records) { return; }

  const ff14_recipes = await DB.get(`ff14_recipes_${crafter}`);

  let records_index = new Set();

  for (const recipe of Object.values(ff14_recipes)) {
    records_index.add(recipe.result.id);
    for (const item of recipe.ingredients) { records_index.add(item.id); }
  }
  records_index = [...records_index.values()];

  const promise_list = [];

  let pending = 0;

  const pause = init_pause(UNIVERSALIS.SEC);

  const load_data = init_load_data(async (...args) => {
    await pause();

    return get_record_by_list(...args);
  }, () => {
    store.set_loaded_current(Math.min(store.get_loaded_current() + UNIVERSALIS.LIM, records_index.length));
    pending--;
  });

  store.set_loaded_current(0);
  store.set_loaded_total(records_index.length);

  for (let i = 0; i < records_index.length; i += UNIVERSALIS.LIM) {
    while (pending === UNIVERSALIS.CON) { await pause(); }

    const page = load_data([records_index.slice(i, i + UNIVERSALIS.LIM)]);

    promise_list.push(page);
    pending++;
  }

  const page_list = await Promise.all(promise_list);
  const records = {};

  for (const page of page_list) {
    for (const [id, item] of Object.entries(page.items)) {
      const list = item.entries.map((sale) => ({
        date: sale.timestamp,
        hq: sale.hq,
        price: sale.pricePerUnit,
        qty: sale.quantity
      }));

      const median = calc_median(list);
      const mad = calc_median(list.map(({ price, qty }) => ({ price: Math.abs(price - median), qty })));
      const range = mad * 1.4826 * 3;

      const list_sd = list.filter(({ price }) => Math.abs(price - median) <= range);

      records[id] = list_sd;
    }

    for (const id of page.unresolvedItems) {
      records[id] = [];
    }
  }

  await DB.set(`ff14_records_${crafter}`, records);
  await DB.set(`ff14_records_${crafter}_updated`, Date.now());
};

const save_recipes_selected = () => { localStorage[`ff14_recipes_selected_${localStorage.ff14_crafter}`] = JSON.stringify(store.get_recipes().filter((recipe) => recipe.selected).map((recipe) => ({ id: recipe.id, selected: recipe.selected }))); };

//handlers

const handle_change_crafter = async (event) => {
  if (localStorage.ff14_crafter !== event.target.value) {
    save_recipes_selected();
    localStorage.ff14_crafter = event.target.value;

    store.set_search("");
    await set_date_updated();

    await load_recipes();
    await load_records();
    await set_date_updated();
    await analyze_data();
  }
};

const handle_change_world = async (event) => {
  if (localStorage.ff14_world !== event.target.value) {
    for (const key of await DB.keys()) {
      if (key.startsWith("ff14_records")) {
        DB.del(key);
      }
    }

    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("ff14_recipes_selected")) {
        localStorage[key] = "";
      }
    }

    localStorage.ff14_world = event.target.value;

    store.set_search("");
    await set_date_updated();

    await load_recipes();
    await load_records();
    await set_date_updated();
    await analyze_data();
  }
};

const handle_click_copy = async () => {
  const dom_copy = document.querySelector(".js-copy-summary");

  await navigator.clipboard.writeText(dom_copy.innerText);
  alert("Copied!");
};

const handle_click_expand = (id) => () => {
  const dom_expand_parent = document.querySelector(`.js-expand-parent-${id}`);
  const dom_shrink_parent = document.querySelector(".js-expand-parent.is-expanded");

  if (dom_shrink_parent && dom_shrink_parent !== dom_expand_parent) {
    dom_shrink_parent.classList.toggle("is-expanded");
  }
  dom_expand_parent.classList.toggle("is-expanded");
}

const handle_click_page = (n) => () => { store.set_page(store.get_page() + n); }

const handle_click_refresh = async () => {
  const crafter = localStorage.ff14_crafter;

  store.set_search("");

  localStorage[`ff14_recipes_selected_${crafter}`] = "";
  await DB.del(`ff14_recipes_${crafter}`);
  await DB.del(`ff14_records_${crafter}`);

  await load_recipes();
  await load_records();
  await set_date_updated();
  await analyze_data();
};

const handle_click_sort = (sort) => () => {
  store.set_sort(store.get_sort() === sort ? -sort : sort);
  store.set_page(1);
}

const handle_click_view = (view) => () => {
  store.set_view(view);
  store.set_page(1);
};

const handle_event_select = (id) => async (event) => {
  switch (event.type) {
    case "click":
      event.stopPropagation();
      store.set_recipes_selected(id, Number(event.target.value));
      break;
    case "keydown":
      event.preventDefault();
  }
}

const handle_input_search = (event) => {
  store.set_search(event.target.value);
  store.set_page(1);
};

const handle_unload = () => {
  if (document.visibilityState === "hidden") {
    save_recipes_selected();
  }
};

//view logic

const disable_controls = () => {
  const controls = [dom_page_next, dom_page_previous, dom_refresh, dom_search, dom_select_crafter, dom_select_world, dom_view_all, dom_view_selected];

  for (const dom_control of controls) {
    dom_control.setAttribute("disabled", "");
  }
};

const get_recipes_page = (recipes = store.get_recipes(), page = store.get_page()) => ((start = (page - 1) * PAGE_SIZE) => recipes.slice(start, start + PAGE_SIZE))();

const get_recipes_search = (recipes = store.get_recipes(), search = store.get_search()) => recipes.filter((recipe) => recipe.result.name.toLowerCase().includes(search.toLowerCase()));

const get_recipes_sort = (recipes = store.get_recipes(), sort = store.get_sort()) => {
  const max_profit = (a, b, path) => get_nested(a, path) - get_nested(b, path);

  recipes.sort((a, b) => {
    if (Math.sign(sort) === -1) { //descending
      const c = a;
      a = b;
      b = c;
    }

    switch (Math.abs(sort)) {
      case SORT.LEVEL:
        return a.level_internal - b.level_internal;
      case SORT.VALUE_07_HQ:
        return max_profit(a, b, "result.past_07_days.hq.profit_pd");
      case SORT.VALUE_07_NQ:
        return max_profit(a, b, "result.past_07_days.nq.profit_pd");
      case SORT.VALUE_30_HQ:
        return max_profit(a, b, "result.past_30_days.hq.profit_pd");
      case SORT.VALUE_30_NQ:
        return max_profit(a, b, "result.past_30_days.nq.profit_pd");
    }
  });

  return recipes;
};

const get_recipes_view = (recipes = store.get_recipes(), view = store.get_view()) => {
  switch (view) {
    case VIEW.ALL:
      return recipes;
    case VIEW.SELECTED:
      return recipes.filter((recipe) => recipe.selected);
  }
};

const init_crafter = () => {
  if (!localStorage.ff14_crafter) { localStorage.ff14_crafter = Object.keys(CRAFTER)[0].toLowerCase(); }
  dom_select_crafter.value = localStorage.ff14_crafter;
};

const init_world = () => {
  if (!localStorage.ff14_world) { localStorage.ff14_world = Object.keys(WORLD)[0].toLowerCase(); }
  dom_select_world.value = localStorage.ff14_world;
}

const render_loading_bar = () => {
  const current = store.get_loaded_current();
  const total = store.get_loaded_total();
  const width = current / total * 100;

  dom_loading_bar.innerHTML = `
    <div class="c-loading-bar">
      <div class="c-loading-bar__back" style="width: ${width}%"></div>
      <p class="c-loading-bar__text">Loaded ${print_n(current)} / ${print_n(total)}</p>
    </div>
  `;
};

const render_summary = (recipes) => {
  const sort_type = Math.abs(store.get_sort());

  let results = recipes.map(({ result, selected }) => {
    const map = {
      [SORT.VALUE_07_HQ]: "past_07_days.hq",
      [SORT.VALUE_07_NQ]: "past_07_days.nq",
      [SORT.VALUE_30_HQ]: "past_30_days.hq",
      [SORT.VALUE_30_NQ]: "past_30_days.nq"
    };

    return {
      name: result.name,
      price: ((path = map[sort_type]) => path ? get_nested(result, path).price : 0)(),
      profit_pd: ((path = map[sort_type]) => path ? get_nested(result, path).profit_pd : 0)(),
      qty: result.qty * selected
    };
  });

  let ingredients = (() => {
    const set = {};

    for (const { ingredients, selected } of recipes) {
      for (const { name, past_07_days, past_30_days, qty } of ingredients) {
        if (!set[name]) {
          set[name] = {
            price: (() => {
              switch (sort_type) {
                case SORT.VALUE_07_HQ:
                case SORT.VALUE_07_NQ:
                  return past_07_days;
                case SORT.VALUE_30_HQ:
                case SORT.VALUE_30_NQ:
                  return past_30_days;
                default:
                  return 0;
              }
            })(),
            qty: 0
          };
        }
        set[name].qty += qty * selected;
      }
    }

    return Object.entries(set).map(([name, { price, qty }]) => ({
      name,
      price,
      qty
    }));
  })();

  const calc_total_price = (list) => list.some(({ price }) => !price) ? 0 : list.reduce((total, { price, qty }) => total + price * qty, 0);
  const calc_total_profit_pd = (list) => list.some(({ profit_pd }) => !profit_pd) ? 0 : list.reduce((total, { profit_pd }) => total + profit_pd, 0);

  const calc_max_length = (list) => list.reduce((max, str) => Math.max(max, str.replaceAll("&nbsp;", "").length), 0);
  const calc_max_length_item = (list) => calc_max_length(list.map(({ name, qty }) => get_str_item({ name, qty })));

  const get_space = (n) => Array(n).fill("&nbsp;").join("");
  const get_str_data = (data, text) => data ? `${get_space(4)}${print_n(data)}${text}` : "";

  const get_str_item = ({ name, price, qty }, max = 0) => {
    const str_name = `${name}${qty > 1 ? ` (${print_n(qty)})` : ""}`;
    const str_price = price && max ? `${get_space(max - str_name.length)} | ${print_n(price * qty)} gil` : "";

    return `${get_space(4)}${str_name}${str_price}`;
  };

  const income = calc_total_price(results) * (1 - MB_TAX);
  const cost = calc_total_price(ingredients) * (1 + MB_TAX);
  const profit = income && cost ? income - cost : 0;
  const profit_pd = calc_total_profit_pd(results);

  let totals = [
    get_str_data(income, " gil income"),
    get_str_data(cost, " gil cost"),
    get_str_data(profit, " gil profit"),
    get_str_data(profit_pd, " gil / day profit")
  ];

  const max_length = Math.max(calc_max_length_item(results), calc_max_length_item(ingredients), calc_max_length(totals));

  const sort_list = (list) => list.sort((a, b) => a.name.localeCompare(b.name)).map((item) => get_str_item(item, max_length));

  results = sort_list(results);
  ingredients = sort_list(ingredients);
  totals = totals.filter((str) => str);

  const has_results = results.length > 0;
  const has_ingredients = ingredients.length > 0;
  const has_totals = totals.length > 0;

  return has_results || has_ingredients || has_totals ? `
    <div class="c-summary">
      <button class="c-summary__copy js-click-copy">Copy</button>
      <p class="c-summary__text js-copy-summary">
        Summary
        ${has_results ? `
          <br>
          <br>
          ${get_space(2)}Results
          <br>
          <br>
          ${results.join("<br>")}        
        ` : ""}
        ${has_ingredients ? `
          <br>
          <br>
          ${get_space(2)}Ingredients
          <br>
          <br>
          ${ingredients.join("<br>")}        
        ` : ""}
        ${has_totals ? `
          <br>
          <br>
          ${get_space(2)}Totals
          <br>
          <br>
          ${totals.join("<br>")}
        ` : ""}
      </p>
    </div>
  ` : "";
};

const render_table = () => {
  const recipes = get_recipes_page(get_recipes_sort(get_recipes_search(get_recipes_view())));

  const sort_list = {
    LEVEL: SORT.LEVEL,
    VALUE_07_HQ: -SORT.VALUE_07_HQ,
    VALUE_07_NQ: -SORT.VALUE_07_NQ,
    VALUE_30_HQ: -SORT.VALUE_30_HQ,
    VALUE_30_NQ: -SORT.VALUE_30_NQ
  };

  const get_str_price = (price, qty) => price ? `${print_n(price)} gil${qty > 1 ? ` (${print_n(price * qty)} total)` : ""}` : "?";

  const render_ingredient = (price, qty) => `<td class="c-table__cell" colspan=4>${get_str_price(price, qty)}</td>`;

  const render_result = ({ price, profit, profit_pc, profit_pd, qty, sold, sold_ge, sold_pc }) => {
    const [color, plus] = profit > 0 ? ["u-color-green", "+"] : ["u-color-red", ""];

    return `
      <td class="c-result c-table__cell" colspan=2>
        ${profit ? `
          <p class="c-result__stat">${get_str_price(price, qty)}</p>
          <p class="c-result__stat"><span class="${color}">${plus}${print_n(profit)} gil</span> (${print_n(profit_pc)})%</p>
          <p class="c-result__stat">${print_n(sold_ge)} / ${print_n(sold)} sold (${print_n(sold_pc)}%)</p>
          <p class="c-result__stat ${color}">${plus}${print_n(profit_pd)} gil / day</p>
        ` : "?"}
      </td>
    `;
  };

  const summary = store.get_view() === VIEW.SELECTED ? render_summary(recipes) : "";

  dom_table.innerHTML = `
    <table class="c-table ${summary ? "u-margin-below" : ""}">
      <thead>
        <tr>
          <th class="c-table__cell" rowspan=2>Select</th>
          <th class="c-table__cell js-click-sort-level" rowspan=2>Level ⇳</th>
          <th class="c-table__cell" colspan=2 rowspan=2>Item</th>
          <th class="c-table__cell" colspan=4>Past 7 Days</th>
          <th class="c-table__cell" colspan=4>Past 30 Days</th>
        </tr>
        <tr>
          <th class="c-table__cell js-click-sort-value-07-nq" colspan=2>NQ ⇳</th>
          <th class="c-table__cell js-click-sort-value-07-hq" colspan=2>HQ ⇳</th>
          <th class="c-table__cell js-click-sort-value-30-nq" colspan=2>NQ ⇳</th>
          <th class="c-table__cell js-click-sort-value-30-hq" colspan=2>HQ ⇳</th>
        </tr>
      </thead>
      ${recipes.reduce((html, recipe) => `
        ${html}
        <tbody class="js-expand-parent js-expand-parent-${recipe.id}">
          <tr class="js-click-expand js-click-expand-${recipe.id}">
            <td class="c-table__cell"><input class="c-count js-event-count-${recipe.id}" type="number" max="99" min="0" value="${recipe.selected}"></td>
            <td class="c-table__cell">${print_n(recipe.level)}${recipe.source ? ` (${recipe.source})` : ""}</td>
            ${(({ result: item } = recipe) => `
              <td class="c-table__cell" colspan=2>${item.name}${item.qty > 1 ? ` (${print_n(item.qty)})` : ""}</td>
              ${render_result(item.past_07_days.nq)}
              ${render_result(item.past_07_days.hq)}
              ${render_result(item.past_30_days.nq)}
              ${render_result(item.past_30_days.hq)}
            `)()}
          </tr>
          ${recipe.ingredients.reduce((html, item, i) => `
            ${html}
            <tr class="js-expand-target">
              ${i > 0 ? "" : `
                <td class="c-table__cell" rowspan=${recipe.ingredients.length}></td>
                <td class="c-table__cell" rowspan=${recipe.ingredients.length}></td>
              `}
              <td class="c-table__cell" colspan=2>${item.name}${item.qty > 1 ? ` (${print_n(item.qty)})` : ""}</td>
              ${render_ingredient(item.past_07_days, item.qty)}
              ${render_ingredient(item.past_30_days, item.qty)}
            </tr>
          `, "")}
        </tbody>
      `, "")}
    </table>
    ${summary}
  `;

  for (const [name, type] of Object.entries(sort_list)) {
    const dom_sort_type = document.querySelector(`.js-click-sort-${name.toLowerCase().replaceAll("_", "-")}`);

    dom_sort_type.addEventListener("click", handle_click_sort(type));
  }

  for (const { id } of recipes) {
    const dom_expand = document.querySelector(`.js-click-expand-${id}`);
    const dom_select = document.querySelector(`.js-event-count-${id}`);

    dom_expand.addEventListener("click", handle_click_expand(id));
    for (const event of ["click", "keydown"]) {
      dom_select.addEventListener(event, handle_event_select(id));
    }
  }

  if (summary) {
    const dom_copy = document.querySelector(".js-click-copy");

    dom_copy.addEventListener("click", handle_click_copy);
  }
}

const set_date_updated = async () => {
  const crafter = localStorage.ff14_crafter;
  const date = await DB.get(`ff14_records_${crafter}_updated`);

  dom_date_updated.innerHTML = !date ? "N/A" : new Date(date).toLocaleString("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    month: "numeric",
    year: "numeric"
  });
};

//watchers

const watch_loaded_current = () => {
  dom_loading_bar.classList.remove("is-hidden");
  dom_table.classList.add("is-hidden");

  disable_controls();
  render_loading_bar();
};

const watch_loaded_total = () => {
  dom_loading_bar.classList.remove("is-hidden");
  dom_table.classList.add("is-hidden");

  disable_controls();
  render_loading_bar();
};

const watch_page = (page) => {
  const last = Math.ceil(get_recipes_search(get_recipes_view()).length / PAGE_SIZE);

  if (last <= 1) {
    dom_page_next.setAttribute("disabled", "");
    dom_page_previous.setAttribute("disabled", "");
  } else {
    switch (page) {
      case 1:
        dom_page_next.removeAttribute("disabled");
        dom_page_previous.setAttribute("disabled", "");
        break;
      case last:
        dom_page_next.setAttribute("disabled", "");
        dom_page_previous.removeAttribute("disabled");
        break;
      default:
        dom_page_next.removeAttribute("disabled");
        dom_page_previous.removeAttribute("disabled");
    }
  }

  render_table();
};

const watch_recipes = async () => {
  dom_refresh.removeAttribute("disabled");
  dom_search.removeAttribute("disabled");
  dom_select_crafter.removeAttribute("disabled");
  dom_select_world.removeAttribute("disabled");

  dom_loading_bar.classList.add("is-hidden");
  dom_table.classList.remove("is-hidden");

  //order matters
  store.set_sort(SORT.LEVEL);
  store.set_view(VIEW.ALL);
  store.set_page(1);

  render_table();
};

const watch_recipes_selected = () => {
  const page = store.get_page();
  const view = store.get_view();
  const recipes = get_recipes_view(store.get_recipes(), VIEW.SELECTED);

  let dom_expand = document.querySelector(".js-expand-parent.is-expanded");

  const id = dom_expand && [...dom_expand.classList.values()].find((str) => str.match(/js-expand-parent-\d+/));

  switch (view) {
    case VIEW.ALL:
      if (recipes.length) {
        dom_view_selected.removeAttribute("disabled");
      } else {
        dom_view_selected.setAttribute("disabled", "");
      }
      break;
    case VIEW.SELECTED:
      if (!recipes.length) {
        store.set_view(VIEW.ALL);
        store.set_page(1);
      } else {
        if (Math.ceil(recipes.length / PAGE_SIZE) < page) {
          store.set_page(page - 1);
        }
      }
      break;
  }

  render_table();

  if (id && view === store.get_view()) {
    dom_expand = document.querySelector(`.${id}`);

    if (dom_expand) { dom_expand.classList.toggle("is-expanded"); }
  }
};

const watch_search = (search) => {
  dom_search.value = search;

  render_table();
};

const watch_view = (view) => {
  switch (view) {
    case VIEW.ALL:
      dom_view_all.setAttribute("disabled", "");
      if (store.get_recipes().some((recipe) => recipe.selected)) {
        dom_view_selected.removeAttribute("disabled");
      } else {
        dom_view_selected.setAttribute("disabled", "");
      }
      break;
    case VIEW.SELECTED:
      dom_view_all.removeAttribute("disabled");
      dom_view_selected.setAttribute("disabled", "");
      break;
  }

  render_table();
};

//initialize

(async () => {
  store.add_loaded_current(watch_loaded_current);
  store.add_loaded_total(watch_loaded_total);
  store.add_page(watch_page);
  store.add_recipes(watch_recipes);
  store.add_recipes_selected(watch_recipes_selected);
  store.add_search(watch_search);
  store.add_view(watch_view);

  dom_page_next.addEventListener("click", handle_click_page(1));
  dom_page_previous.addEventListener("click", handle_click_page(-1));
  dom_refresh.addEventListener("click", handle_click_refresh);
  dom_search.addEventListener("input", handle_input_search);
  dom_select_crafter.addEventListener("change", handle_change_crafter);
  dom_select_world.addEventListener("change", handle_change_world);
  dom_view_all.addEventListener("click", handle_click_view(VIEW.ALL));
  dom_view_selected.addEventListener("click", handle_click_view(VIEW.SELECTED));
  document.addEventListener("visibilitychange", handle_unload);

  init_crafter();
  init_world();

  await load_recipes();
  await load_records();
  await set_date_updated();
  await analyze_data();
})();
