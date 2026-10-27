/**
 * Curated dish information for the recognition feature (PRD v3.3).
 *
 * The image classifiers return bare labels only. Names, descriptions and the
 * listing-category suggestion below are curated reference content keyed by
 * label — they are NOT read from the image, and the UI presents them as a
 * starting point the provider can edit. Descriptions state what a dish
 * typically is; they do not claim ingredients/allergens of the specific
 * photographed item.
 *
 * Keys are the raw model labels (dima806/indian_food_image_detection and
 * therealcyberlord/vit-indian-food). A label with no entry still returns its
 * normalized name with a null description (honest fallback, never invented).
 */

const SWEETS = { category: 'OTHER', categoryNote: 'Sweets' };
const COOKED = { category: 'COOKED_MEALS' };

export const DISH_INFO = {
  // ---- Primary model (dima806, 80 classes) ----
  adhirasam: { name: 'Adhirasam', description: 'A traditional Tamil sweet of rice flour and jaggery, shaped into discs and deep-fried, commonly made during festivals.', ...SWEETS },
  aloo_gobi: { name: 'Aloo Gobi', description: 'A dry North Indian curry of potatoes and cauliflower cooked with turmeric, cumin and other spices.', ...COOKED },
  aloo_matar: { name: 'Aloo Matar', description: 'A home-style curry of potatoes and green peas simmered in a spiced tomato-onion gravy.', ...COOKED },
  aloo_methi: { name: 'Aloo Methi', description: 'Potatoes stir-fried with fresh fenugreek leaves and spices, a common North Indian sabzi.', ...COOKED },
  aloo_shimla_mirch: { name: 'Aloo Shimla Mirch', description: 'A dry curry of potatoes and capsicum (bell peppers) tossed with Indian spices.', ...COOKED },
  aloo_tikki: { name: 'Aloo Tikki', description: 'Crisp shallow-fried potato patties, a popular street snack often served with chutneys.', ...COOKED },
  anarsa: { name: 'Anarsa', description: 'A Maharashtrian festive sweet of fermented rice flour and jaggery, coated with poppy seeds and fried.', ...SWEETS },
  ariselu: { name: 'Ariselu', description: 'A Telugu sweet of rice flour and jaggery discs, pressed with sesame seeds and deep-fried.', ...SWEETS },
  bandar_laddu: { name: 'Bandar Laddu', description: 'A famous Andhra sweet from Bandar (Machilipatnam) — smooth besan laddus made with ghee and sugar.', ...SWEETS },
  basundi: { name: 'Basundi', description: 'A thickened sweet milk dessert from Gujarat and Maharashtra, flavoured with cardamom and nuts.', ...SWEETS },
  bhatura: { name: 'Bhatura', description: 'A fluffy deep-fried leavened bread, classically served with chole (chickpea curry) as chole bhature.', ...COOKED },
  bhindi_masala: { name: 'Bhindi Masala', description: 'Okra cooked with onions, tomatoes and spices — a widely loved dry sabzi.', ...COOKED },
  biryani: { name: 'Biryani', description: 'A fragrant layered rice dish cooked with spices and vegetables, chicken or meat, served with raita or mirchi ka salan.', ...COOKED },
  boondi: { name: 'Boondi', description: 'Tiny fried besan droplets, served sweet as a prasad/sweet or salted in raita and mixtures.', ...SWEETS },
  butter_chicken: { name: 'Butter Chicken', description: 'A Delhi-origin curry of tandoor-cooked chicken simmered in a creamy tomato-butter gravy.', ...COOKED },
  chak_hao_kheer: { name: 'Chak Hao Kheer', description: 'A Manipuri pudding made from black (forbidden) rice cooked in milk, giving it a purple hue.', ...SWEETS },
  cham_cham: { name: 'Cham Cham', description: 'A Bengali sweet of chhena (fresh curd cheese) poached in syrup, sometimes coated with coconut or mawa.', ...SWEETS },
  chana_masala: { name: 'Chana Masala', description: 'Chickpeas simmered in a spiced tomato-onion gravy, a Punjabi staple served with bhatura, puri or rice.', ...COOKED },
  chapati: { name: 'Chapati', description: 'A soft unleavened whole-wheat flatbread, rolled thin and puffed on a tawa — an everyday Indian staple.', ...COOKED },
  chhena_kheeri: { name: 'Chhena Kheeri', description: 'An Odia dessert of chhena cooked in thickened sweetened milk.', ...SWEETS },
  chicken_razala: { name: 'Chicken Rezala', description: 'A Kolkata Mughlai curry of chicken in a white, mildly spiced yogurt-and-cashew gravy.', ...COOKED },
  chicken_tikka: { name: 'Chicken Tikka', description: 'Char-grilled chunks of marinated chicken, cooked in a tandoor or on skewers, served as a starter.', ...COOKED },
  chicken_tikka_masala: { name: 'Chicken Tikka Masala', description: 'Chicken tikka pieces folded into a spiced, creamy tomato gravy — a restaurant favourite worldwide.', ...COOKED },
  chikki: { name: 'Chikki', description: 'A brittle sweet of peanuts (or sesame) set in caramelised jaggery, popular in Maharashtra and Gujarat.', ...SWEETS },
  daal_baati_churma: { name: 'Dal Baati Churma', description: 'A Rajasthani platter of baked wheat baatis served with dal and sweet crumbled churma, with ghee.', ...COOKED },
  daal_puri: { name: 'Dal Puri', description: 'A Bengali-style puri — a deep-fried puffed bread, sometimes stuffed with a spiced dal filling.', ...COOKED },
  dal_makhani: { name: 'Dal Makhani', description: 'Black lentils and kidney beans slow-cooked with butter and cream into a rich Punjabi dal.', ...COOKED },
  dal_tadka: { name: 'Dal Tadka', description: 'Yellow arhar/moong dal finished with a sizzling tempering of ghee, garlic and dried red chillies.', ...COOKED },
  dharwad_pedha: { name: 'Dharwad Pedha', description: 'A GI-tagged caramelised milk sweet from Dharwad, Karnataka, with a characteristic brown colour.', ...SWEETS },
  doodhpak: { name: 'Doodhpak', description: 'A Gujarati rice pudding — rice slow-cooked in sweetened milk with cardamom and nuts.', ...SWEETS },
  double_ka_meetha: { name: 'Double Ka Meetha', description: 'A Hyderabadi bread pudding of fried bread slices soaked in saffron-cardamom milk (rabri).', ...SWEETS },
  dum_aloo: { name: 'Dum Aloo', description: 'Whole small potatoes slow-cooked (dum) in a spiced gravy; versions exist in Kashmiri and Bengali styles.', ...COOKED },
  gajar_ka_halwa: { name: 'Gajar Ka Halwa', description: 'A winter dessert of grated carrots slow-cooked in milk, ghee and sugar, garnished with nuts.', ...SWEETS },
  gavvalu: { name: 'Gavvalu', description: 'Shell-shaped Andhra sweet of fried dough pieces glazed with sugar or jaggery syrup.', ...SWEETS },
  ghevar: { name: 'Ghevar', description: 'A Rajasthani disc-shaped honeycomb sweet soaked in syrup, often topped with rabri, made for Teej and Rakhi.', ...SWEETS },
  gulab_jamun: { name: 'Gulab Jamun', description: 'Soft khoya (milk-solid) dumplings deep-fried and soaked in rose-cardamom sugar syrup — among India\'s most loved sweets.', ...SWEETS },
  imarti: { name: 'Imarti', description: 'A flower-shaped sweet of urad-dal batter piped into oil and soaked in sugar syrup, similar to jalebi but thicker.', ...SWEETS },
  jalebi: { name: 'Jalebi', description: 'Crisp spirals of fermented batter, fried and soaked in saffron sugar syrup; eaten hot, often with rabri or poha.', ...SWEETS },
  kachori: { name: 'Kachori', description: 'A flaky deep-fried pastry with a spiced filling (often moong dal or onion), served with chutney or aloo sabzi.', ...COOKED },
  kadai_paneer: { name: 'Kadai Paneer', description: 'Paneer cubes tossed with capsicum and onions in a masala ground from kadai (wok) spices.', ...COOKED },
  kadhi_pakoda: { name: 'Kadhi Pakoda', description: 'A tangy yogurt-and-besan curry with soft onion fritters (pakodas) dunked in, served with rice.', ...COOKED },
  kajjikaya: { name: 'Kajjikaya', description: 'An Andhra half-moon sweet of fried pastry filled with coconut and sugar/jaggery, similar to gujiya.', ...SWEETS },
  kakinada_khaja: { name: 'Kakinada Khaja', description: 'A layered, syrup-soaked pastry sweet named after the Andhra city of Kakinada.', ...SWEETS },
  kalakand: { name: 'Kalakand', description: 'A soft, grainy milk cake made by curdling and reducing milk with sugar, often topped with pistachios.', ...SWEETS },
  karela_bharta: { name: 'Karela Bharta', description: 'Mashed bitter gourd cooked with onions and spices — a rustic, tangy-bitter side dish.', ...COOKED },
  kofta: { name: 'Kofta', description: 'Fried dumplings of vegetables or meat served in a rich spiced gravy (malai kofta uses paneer-potato balls).', ...COOKED },
  kuzhi_paniyaram: { name: 'Kuzhi Paniyaram', description: 'Small round Tamil dumplings made from fermented idli/dosa batter in a special pan, served with chutney.', ...COOKED },
  lassi: { name: 'Lassi', description: 'A Punjabi yogurt drink, sweet or salted, churned thick and often topped with malai.', category: 'BEVERAGES' },
  ledikeni: { name: 'Ledikeni', description: 'A Bengali sweet of deep-fried chhena balls in syrup, said to be named after Lady Canning.', ...SWEETS },
  litti_chokha: { name: 'Litti Chokha', description: 'A Bihari dish of ghee-dipped wheat balls stuffed with sattu, served with roasted brinjal-tomato chokha.', ...COOKED },
  lyangcha: { name: 'Lyangcha', description: 'A Bengali sweet of elongated fried chhena-khoya pieces soaked in syrup.', ...SWEETS },
  maach_jhol: { name: 'Maach Jhol', description: 'A light Bengali fish curry with potatoes and cauliflower in a thin, mildly spiced gravy.', ...COOKED },
  makki_di_roti_sarson_da_saag: { name: 'Makki Di Roti Sarson Da Saag', description: 'The classic Punjabi winter pairing of cornmeal rotis with slow-cooked mustard-greens saag and white butter.', ...COOKED },
  malapua: { name: 'Malapua', description: 'Sweet pancakes of flour batter fried in ghee and soaked in syrup, popular across Odisha, Bengal and UP.', ...SWEETS },
  misi_roti: { name: 'Misi Roti', description: 'A Rajasthani flatbread of wheat and besan flours kneaded with spices and onion.', ...COOKED },
  misti_doi: { name: 'Mishti Doi', description: 'Bengal\'s beloved sweet yogurt — milk and caramelised sugar set in earthen pots.', ...SWEETS },
  modak: { name: 'Modak', description: 'Maharashtrian sweet dumplings of rice flour filled with coconut and jaggery, steamed (ukdiche) or fried; Ganesh Chaturthi\'s signature sweet.', ...SWEETS },
  mysore_pak: { name: 'Mysore Pak', description: 'A rich Karnataka sweet of besan, sugar and generous ghee, set into melt-in-the-mouth (or crisp) blocks.', ...SWEETS },
  naan: { name: 'Naan', description: 'A soft leavened flatbread baked in a tandoor, often brushed with butter or garlic.', ...COOKED },
  navrattan_korma: { name: 'Navrattan Korma', description: 'A royal mixed-vegetable (and fruit/nut) curry in a creamy gravy — "navrattan" means nine gems.', ...COOKED },
  palak_paneer: { name: 'Palak Paneer', description: 'Paneer cubes folded into a smooth spiced spinach gravy, a North Indian staple.', ...COOKED },
  paneer_butter_masala: { name: 'Paneer Butter Masala', description: 'Paneer simmered in a creamy tomato-butter gravy — among the most ordered vegetarian curries.', ...COOKED },
  phirni: { name: 'Phirni', description: 'A chilled ground-rice pudding flavoured with cardamom or saffron, traditionally set in earthen bowls.', ...SWEETS },
  pithe: { name: 'Pithe', description: 'Bengali rice-flour cakes/dumplings made in winter, often filled with coconut-jaggery or soaked in milk.', ...SWEETS },
  poha: { name: 'Poha', description: 'A popular Maharashtrian breakfast dish made from flattened rice, typically cooked with onions, mustard seeds, turmeric, green chillies and curry leaves.', ...COOKED },
  poornalu: { name: 'Poornalu', description: 'An Andhra festive sweet: chana-dal and jaggery balls coated in rice-urad batter and fried, similar to suzhiyam.', ...SWEETS },
  pootharekulu: { name: 'Pootharekulu', description: 'An Andhra "paper sweet" of wafer-thin rice-starch sheets layered with sugar/jaggery and ghee, from Atreyapuram.', ...SWEETS },
  qubani_ka_meetha: { name: 'Qubani Ka Meetha', description: 'A Hyderabadi dessert of stewed dried apricots, served with cream or ice cream.', ...SWEETS },
  rabri: { name: 'Rabri', description: 'Layers of cream from slow-reduced sweetened milk, flavoured with cardamom — eaten alone or over jalebi/shahi tukda.', ...SWEETS },
  ras_malai: { name: 'Rasmalai', description: 'Soft flattened chhena discs soaked in chilled, saffron-cardamom flavoured milk.', ...SWEETS },
  rasgulla: { name: 'Rasgulla', description: 'Spongy chhena balls poached in light sugar syrup, a signature sweet of Bengal and Odisha.', ...SWEETS },
  sandesh: { name: 'Sandesh', description: 'A delicate Bengali sweet of fresh chhena lightly sweetened and flavoured, often moulded into shapes.', ...SWEETS },
  shankarpali: { name: 'Shankarpali', description: 'Diamond-shaped fried dough biscuits, sweet or salted — a Diwali faral staple in Maharashtra.', ...SWEETS },
  sheer_korma: { name: 'Sheer Khurma', description: 'A festive Eid dessert of vermicelli cooked in milk with dates and dry fruits. (Listed by the model as "sheer korma".)', ...SWEETS },
  sheera: { name: 'Sheera', description: 'A soft semolina (rava) halwa cooked in ghee and milk/water, often served as prasad.', ...SWEETS },
  shrikhand: { name: 'Shrikhand', description: 'A Gujarati-Maharashtrian dessert of thick strained yogurt sweetened and flavoured with saffron and cardamom.', ...SWEETS },
  sohan_halwa: { name: 'Sohan Halwa', description: 'A dense, chewy halwa of wheat extract, sugar, ghee and nuts, associated with Multan and Delhi sweet shops.', ...SWEETS },
  sohan_papdi: { name: 'Soan Papdi', description: 'A flaky, cube-shaped gram-flour confection that melts in the mouth, often gifted at Diwali. (Listed by the model as "sohan papdi".)', ...SWEETS },
  sutar_feni: { name: 'Sutar Feni', description: 'A fine, thread-like fried sweet from Gujarat/Rajasthan, soaked lightly in syrup and eaten with warm milk.', ...SWEETS },
  unni_appam: { name: 'Unni Appam', description: 'Small round Kerala rice cakes with banana and jaggery, fried in an appam pan.', ...SWEETS },

  // ---- Specialist model (therealcyberlord/vit-indian-food, 15 classes) ----
  // Labels identical to the primary (biryani, jalebi, kofta, naan) reuse the
  // entries above. The rest:
  cholebhature: { name: 'Chole Bhature', description: 'A Punjabi favourite of spicy chickpea curry served with fluffy deep-fried bhature.', ...COOKED },
  dabeli: { name: 'Dabeli', description: 'A Kutchi street snack: a bun stuffed with tangy-sweet spiced potato, pomegranate, peanuts and sev.', ...COOKED },
  dal: { name: 'Dal', description: 'A staple lentil curry — lentils simmered with spices and finished with a tempering. The specialist model uses this generic label.', ...COOKED },
  dhokla: { name: 'Dhokla', description: 'A soft, spongy steamed Gujarati snack made from fermented besan/rice batter, tempered with mustard seeds and curry leaves.', ...COOKED },
  dosa: { name: 'Dosa', description: 'A crisp South Indian crepe of fermented rice-and-urad batter, typically served with sambar and chutneys.', ...COOKED },
  kathiroll: { name: 'Kathi Roll', description: 'A Kolkata street food: a flaky paratha wrapped around spiced kebab, egg or vegetables with onions and chutney.', ...COOKED },
  pakora: { name: 'Pakora', description: 'Vegetables (or paneer) dipped in spiced besan batter and deep-fried — a monsoon and tea-time favourite.', ...COOKED },
  paneer: { name: 'Paneer Dish', description: 'A dish centred on paneer (Indian cottage cheese), such as a paneer curry. The specialist model uses this generic label.', ...COOKED },
  panipuri: { name: 'Pani Puri', description: 'Crisp hollow puris filled with potato/chana and spicy tangy water — called golgappa or puchka in other regions.', ...COOKED },
  pavbhaji: { name: 'Pav Bhaji', description: 'A Mumbai street-food classic: a spicy mashed-vegetable bhaji cooked on a tawa with butter, served with soft buttered pav.', ...COOKED },
  vadapav: { name: 'Vada Pav', description: 'Mumbai\'s iconic burger: a spiced potato vada in a pav bun with chutneys and a fried green chilli.', ...COOKED },
};

/** 'aloo_gobi' / 'cholebhature' -> readable 'Aloo Gobi' / 'Cholebhature'. */
export function normalizeDishLabel(label) {
  return String(label || '')
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Enrich one raw prediction {label, score} with curated info.
 * Returns { label, name, score, description|null, category|null, categoryNote|null }.
 */
export function enrichPrediction(pred) {
  const info = DISH_INFO[pred.label];
  return {
    label: pred.label,
    name: info?.name ?? normalizeDishLabel(pred.label),
    score: pred.score,
    description: info?.description ?? null,
    category: info?.category ?? null,
    categoryNote: info?.categoryNote ?? null,
  };
}

export const DESCRIPTION_FALLBACK =
  'No description available for this dish yet — please check the name and add details.';
