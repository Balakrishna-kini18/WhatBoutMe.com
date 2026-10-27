/**
 * Standard list of countries for user profile and signup.
 */
export const COUNTRIES: string[] = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Antigua and Barbuda",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Colombia",
  "Comoros",
  "Congo",
  "Costa Rica",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czech Republic",
  "Democratic Republic of the Congo",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Honduras",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Ivory Coast",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Mexico",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "North Korea",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Palestine",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Russia",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Korea",
  "South Sudan",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Suriname",
  "Sweden",
  "Switzerland",
  "Syria",
  "Taiwan",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Timor-Leste",
  "Togo",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Vatican City",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zambia",
  "Zimbabwe",
];

export interface CountryData {
  name: string;
  code: string;
  dialCode: string;
  defaultTimezone: string;
  placeholder: string;
  flag: string;
}

export const COUNTRY_METADATA: Record<string, Omit<CountryData, "name">> = {
  "Afghanistan": { code: "AF", dialCode: "+93", defaultTimezone: "Asia/Kabul", placeholder: "70 123 4567", flag: "🇦🇫" },
  "Albania": { code: "AL", dialCode: "+355", defaultTimezone: "Europe/Tirane", placeholder: "69 123 4567", flag: "🇦🇱" },
  "Algeria": { code: "DZ", dialCode: "+213", defaultTimezone: "Africa/Algiers", placeholder: "551 23 45 67", flag: "🇩🇿" },
  "Andorra": { code: "AD", dialCode: "+376", defaultTimezone: "Europe/Andorra", placeholder: "312 345", flag: "🇦🇩" },
  "Angola": { code: "AO", dialCode: "+244", defaultTimezone: "Africa/Luanda", placeholder: "923 123 456", flag: "🇦🇴" },
  "Antigua and Barbuda": { code: "AG", dialCode: "+1", defaultTimezone: "America/Antigua", placeholder: "(268) 720-1234", flag: "🇦🇬" },
  "Argentina": { code: "AR", dialCode: "+54", defaultTimezone: "America/Argentina/Buenos_Aires", placeholder: "9 11 1234-5678", flag: "🇦🇷" },
  "Armenia": { code: "AM", dialCode: "+374", defaultTimezone: "Asia/Yerevan", placeholder: "77 123456", flag: "🇦🇲" },
  "Australia": { code: "AU", dialCode: "+61", defaultTimezone: "Australia/Sydney", placeholder: "412 345 678", flag: "🇦🇺" },
  "Austria": { code: "AT", dialCode: "+43", defaultTimezone: "Europe/Vienna", placeholder: "664 1234567", flag: "🇦🇹" },
  "Azerbaijan": { code: "AZ", dialCode: "+994", defaultTimezone: "Asia/Baku", placeholder: "50 123 45 67", flag: "🇦🇿" },
  "Bahamas": { code: "BS", dialCode: "+1", defaultTimezone: "America/Nassau", placeholder: "(242) 359-1234", flag: "🇧🇸" },
  "Bahrain": { code: "BH", dialCode: "+973", defaultTimezone: "Asia/Bahrain", placeholder: "3600 1234", flag: "🇧🇭" },
  "Bangladesh": { code: "BD", dialCode: "+880", defaultTimezone: "Asia/Dhaka", placeholder: "1712 345678", flag: "🇧🇩" },
  "Barbados": { code: "BB", dialCode: "+1", defaultTimezone: "America/Barbados", placeholder: "(246) 230-1234", flag: "🇧🇧" },
  "Belarus": { code: "BY", dialCode: "+375", defaultTimezone: "Europe/Minsk", placeholder: "29 123-45-67", flag: "🇧🇾" },
  "Belgium": { code: "BE", dialCode: "+32", defaultTimezone: "Europe/Brussels", placeholder: "470 12 34 56", flag: "🇧🇪" },
  "Belize": { code: "BZ", dialCode: "+501", defaultTimezone: "America/Belize", placeholder: "612-3456", flag: "🇧🇿" },
  "Benin": { code: "BJ", dialCode: "+229", defaultTimezone: "Africa/Porto-Novo", placeholder: "97 12 34 56", flag: "🇧🇯" },
  "Bhutan": { code: "BT", dialCode: "+975", defaultTimezone: "Asia/Thimphu", placeholder: "17 12 34 56", flag: "🇧🇹" },
  "Bolivia": { code: "BO", dialCode: "+591", defaultTimezone: "America/La_Paz", placeholder: "71234567", flag: "🇧🇴" },
  "Bosnia and Herzegovina": { code: "BA", dialCode: "+387", defaultTimezone: "Europe/Sarajevo", placeholder: "61 123 456", flag: "🇧🇦" },
  "Botswana": { code: "BW", dialCode: "+267", defaultTimezone: "Africa/Gaborone", placeholder: "71 123 456", flag: "🇧🇼" },
  "Brazil": { code: "BR", dialCode: "+55", defaultTimezone: "America/Sao_Paulo", placeholder: "11 91234-5678", flag: "🇧🇷" },
  "Brunei": { code: "BN", dialCode: "+673", defaultTimezone: "Asia/Brunei", placeholder: "712 3456", flag: "🇧🇳" },
  "Bulgaria": { code: "BG", dialCode: "+359", defaultTimezone: "Europe/Sofia", placeholder: "87 123 4567", flag: "🇧🇬" },
  "Burkina Faso": { code: "BF", dialCode: "+226", defaultTimezone: "Africa/Ouagadougou", placeholder: "70 12 34 56", flag: "🇧🇫" },
  "Burundi": { code: "BI", dialCode: "+257", defaultTimezone: "Africa/Bujumbura", placeholder: "79 12 34 56", flag: "🇧🇮" },
  "Cabo Verde": { code: "CV", dialCode: "+238", defaultTimezone: "Atlantic/Cape_Verde", placeholder: "991 23 45", flag: "🇨🇻" },
  "Cambodia": { code: "KH", dialCode: "+855", defaultTimezone: "Asia/Phnom_Penh", placeholder: "12 345 678", flag: "🇰🇭" },
  "Cameroon": { code: "CM", dialCode: "+237", defaultTimezone: "Africa/Douala", placeholder: "6 71 23 45 67", flag: "🇨🇲" },
  "Canada": { code: "CA", dialCode: "+1", defaultTimezone: "America/Toronto", placeholder: "(555) 000-0000", flag: "🇨🇦" },
  "Central African Republic": { code: "CF", dialCode: "+236", defaultTimezone: "Africa/Bangui", placeholder: "70 12 34 56", flag: "🇨🇫" },
  "Chad": { code: "TD", dialCode: "+235", defaultTimezone: "Africa/Ndjamena", placeholder: "66 12 34 56", flag: "🇹🇩" },
  "Chile": { code: "CL", dialCode: "+56", defaultTimezone: "America/Santiago", placeholder: "9 1234 5678", flag: "🇨🇱" },
  "China": { code: "CN", dialCode: "+86", defaultTimezone: "Asia/Shanghai", placeholder: "138 0013 8000", flag: "🇨🇳" },
  "Colombia": { code: "CO", dialCode: "+57", defaultTimezone: "America/Bogota", placeholder: "300 1234567", flag: "🇨🇴" },
  "Comoros": { code: "KM", dialCode: "+269", defaultTimezone: "Indian/Comoro", placeholder: "321 23 45", flag: "🇰🇲" },
  "Congo": { code: "CG", dialCode: "+242", defaultTimezone: "Africa/Brazzaville", placeholder: "06 123 4567", flag: "🇨🇬" },
  "Costa Rica": { code: "CR", dialCode: "+506", defaultTimezone: "America/Costa_Rica", placeholder: "8312 3456", flag: "🇨🇷" },
  "Croatia": { code: "HR", dialCode: "+385", defaultTimezone: "Europe/Zagreb", placeholder: "91 123 4567", flag: "🇭🇷" },
  "Cuba": { code: "CU", dialCode: "+53", defaultTimezone: "America/Havana", placeholder: "5 1234567", flag: "🇨🇺" },
  "Cyprus": { code: "CY", dialCode: "+357", defaultTimezone: "Asia/Nicosia", placeholder: "96 123456", flag: "🇨🇾" },
  "Czech Republic": { code: "CZ", dialCode: "+420", defaultTimezone: "Europe/Prague", placeholder: "601 123 456", flag: "🇨🇿" },
  "Democratic Republic of the Congo": { code: "CD", dialCode: "+243", defaultTimezone: "Africa/Kinshasa", placeholder: "812 345 678", flag: "🇨🇩" },
  "Denmark": { code: "DK", dialCode: "+45", defaultTimezone: "Europe/Copenhagen", placeholder: "20 12 34 56", flag: "🇩🇰" },
  "Djibouti": { code: "DJ", dialCode: "+253", defaultTimezone: "Africa/Djibouti", placeholder: "77 12 34 56", flag: "🇩🇯" },
  "Dominica": { code: "DM", dialCode: "+1", defaultTimezone: "America/Dominica", placeholder: "(767) 235-1234", flag: "🇩🇲" },
  "Dominican Republic": { code: "DO", dialCode: "+1", defaultTimezone: "America/Santo_Domingo", placeholder: "(809) 234-5678", flag: "🇩🇴" },
  "Ecuador": { code: "EC", dialCode: "+593", defaultTimezone: "America/Guayaquil", placeholder: "99 123 4567", flag: "🇪🇨" },
  "Egypt": { code: "EG", dialCode: "+20", defaultTimezone: "Africa/Cairo", placeholder: "10 1234 5678", flag: "🇪🇬" },
  "El Salvador": { code: "SV", dialCode: "+503", defaultTimezone: "America/El_Salvador", placeholder: "7012 3456", flag: "🇸🇻" },
  "Equatorial Guinea": { code: "GQ", dialCode: "+240", defaultTimezone: "Africa/Malabo", placeholder: "222 123 456", flag: "🇬🇶" },
  "Eritrea": { code: "ER", dialCode: "+291", defaultTimezone: "Africa/Asmara", placeholder: "7 123 456", flag: "🇪🇷" },
  "Estonia": { code: "EE", dialCode: "+372", defaultTimezone: "Europe/Tallinn", placeholder: "5123 4567", flag: "🇪🇪" },
  "Eswatini": { code: "SZ", dialCode: "+268", defaultTimezone: "Africa/Mbabane", placeholder: "7612 3456", flag: "🇸🇿" },
  "Ethiopia": { code: "ET", dialCode: "+251", defaultTimezone: "Africa/Addis_Ababa", placeholder: "91 123 4567", flag: "🇪🇹" },
  "Fiji": { code: "FJ", dialCode: "+679", defaultTimezone: "Pacific/Fiji", placeholder: "701 2345", flag: "🇫🇯" },
  "Finland": { code: "FI", dialCode: "+358", defaultTimezone: "Europe/Helsinki", placeholder: "40 1234567", flag: "🇫🇮" },
  "France": { code: "FR", dialCode: "+33", defaultTimezone: "Europe/Paris", placeholder: "6 12 34 56 78", flag: "🇫🇷" },
  "Gabon": { code: "GA", dialCode: "+241", defaultTimezone: "Africa/Libreville", placeholder: "06 12 34 56", flag: "🇬🇦" },
  "Gambia": { code: "GM", dialCode: "+220", defaultTimezone: "Africa/Banjul", placeholder: "701 2345", flag: "🇬🇲" },
  "Georgia": { code: "GE", dialCode: "+995", defaultTimezone: "Asia/Tbilisi", placeholder: "555 12 34 56", flag: "🇬🇪" },
  "Germany": { code: "DE", dialCode: "+49", defaultTimezone: "Europe/Berlin", placeholder: "151 12345678", flag: "🇩🇪" },
  "Ghana": { code: "GH", dialCode: "+233", defaultTimezone: "Africa/Accra", placeholder: "24 123 4567", flag: "🇬🇭" },
  "Greece": { code: "GR", dialCode: "+30", defaultTimezone: "Europe/Athens", placeholder: "691 234 5678", flag: "🇬🇷" },
  "Grenada": { code: "GD", dialCode: "+1", defaultTimezone: "America/Grenada", placeholder: "(473) 403-1234", flag: "🇬🇩" },
  "Guatemala": { code: "GT", dialCode: "+502", defaultTimezone: "America/Guatemala", placeholder: "5123 4567", flag: "🇬🇹" },
  "Guinea": { code: "GN", dialCode: "+224", defaultTimezone: "Africa/Conakry", placeholder: "621 12 34 56", flag: "🇬🇳" },
  "Guinea-Bissau": { code: "GW", dialCode: "+245", defaultTimezone: "Africa/Bissau", placeholder: "955 12 34 56", flag: "🇬🇼" },
  "Guyana": { code: "GY", dialCode: "+592", defaultTimezone: "America/Guyana", placeholder: "612 3456", flag: "🇬🇾" },
  "Haiti": { code: "HT", dialCode: "+509", defaultTimezone: "America/Port-au-Prince", placeholder: "3412 3456", flag: "🇭🇹" },
  "Honduras": { code: "HN", dialCode: "+504", defaultTimezone: "America/Tegucigalpa", placeholder: "9123 4567", flag: "🇭🇳" },
  "Hungary": { code: "HU", dialCode: "+36", defaultTimezone: "Europe/Budapest", placeholder: "20 123 4567", flag: "🇭🇺" },
  "Iceland": { code: "IS", dialCode: "+354", defaultTimezone: "Atlantic/Reykjavik", placeholder: "612 3456", flag: "🇮🇸" },
  "India": { code: "IN", dialCode: "+91", defaultTimezone: "Asia/Kolkata", placeholder: "98765 43210", flag: "🇮🇳" },
  "Indonesia": { code: "ID", dialCode: "+62", defaultTimezone: "Asia/Jakarta", placeholder: "812 3456 7890", flag: "🇮🇩" },
  "Iran": { code: "IR", dialCode: "+98", defaultTimezone: "Asia/Tehran", placeholder: "912 345 6789", flag: "🇮🇷" },
  "Iraq": { code: "IQ", dialCode: "+964", defaultTimezone: "Asia/Baghdad", placeholder: "790 123 4567", flag: "🇮🇶" },
  "Ireland": { code: "IE", dialCode: "+353", defaultTimezone: "Europe/Dublin", placeholder: "85 123 4567", flag: "🇮🇪" },
  "Israel": { code: "IL", dialCode: "+972", defaultTimezone: "Asia/Jerusalem", placeholder: "50 123 4567", flag: "🇮🇱" },
  "Italy": { code: "IT", dialCode: "+39", defaultTimezone: "Europe/Rome", placeholder: "312 345 6789", flag: "🇮🇹" },
  "Ivory Coast": { code: "CI", dialCode: "+225", defaultTimezone: "Africa/Abidjan", placeholder: "07 12 34 56 78", flag: "🇨🇮" },
  "Jamaica": { code: "JM", dialCode: "+1", defaultTimezone: "America/Jamaica", placeholder: "(876) 210-1234", flag: "🇯🇲" },
  "Japan": { code: "JP", dialCode: "+81", defaultTimezone: "Asia/Tokyo", placeholder: "90 1234 5678", flag: "🇯🇵" },
  "Jordan": { code: "JO", dialCode: "+962", defaultTimezone: "Asia/Amman", placeholder: "7 9012 3456", flag: "🇯🇴" },
  "Kazakhstan": { code: "KZ", dialCode: "+7", defaultTimezone: "Asia/Almaty", placeholder: "701 123 4567", flag: "🇰🇿" },
  "Kenya": { code: "KE", dialCode: "+254", defaultTimezone: "Africa/Nairobi", placeholder: "712 345678", flag: "🇰🇪" },
  "Kiribati": { code: "KI", dialCode: "+686", defaultTimezone: "Pacific/Tarawa", placeholder: "720 12345", flag: "🇰🇮" },
  "Kuwait": { code: "KW", dialCode: "+965", defaultTimezone: "Asia/Kuwait", placeholder: "9123 4567", flag: "🇰🇼" },
  "Kyrgyzstan": { code: "KG", dialCode: "+996", defaultTimezone: "Asia/Bishkek", placeholder: "700 123 456", flag: "🇰🇬" },
  "Laos": { code: "LA", dialCode: "+856", defaultTimezone: "Asia/Vientiane", placeholder: "20 23 123 456", flag: "🇱🇦" },
  "Latvia": { code: "LV", dialCode: "+371", defaultTimezone: "Europe/Riga", placeholder: "21 234 567", flag: "🇱🇻" },
  "Lebanon": { code: "LB", dialCode: "+961", defaultTimezone: "Asia/Beirut", placeholder: "70 123 456", flag: "🇱🇧" },
  "Lesotho": { code: "LS", dialCode: "+266", defaultTimezone: "Africa/Maseru", placeholder: "5012 3456", flag: "🇱🇸" },
  "Liberia": { code: "LR", dialCode: "+231", defaultTimezone: "Africa/Monrovia", placeholder: "77 123 4567", flag: "🇱🇷" },
  "Libya": { code: "LY", dialCode: "+218", defaultTimezone: "Africa/Tripoli", placeholder: "91 123 4567", flag: "🇱🇾" },
  "Liechtenstein": { code: "LI", dialCode: "+423", defaultTimezone: "Europe/Vaduz", placeholder: "660 1234", flag: "🇱🇮" },
  "Lithuania": { code: "LT", dialCode: "+370", defaultTimezone: "Europe/Vilnius", placeholder: "612 34567", flag: "🇱🇹" },
  "Luxembourg": { code: "LU", dialCode: "+352", defaultTimezone: "Europe/Luxembourg", placeholder: "621 123 456", flag: "🇱🇺" },
  "Madagascar": { code: "MG", dialCode: "+261", defaultTimezone: "Indian/Antananarivo", placeholder: "32 12 345 67", flag: "🇲🇬" },
  "Malawi": { code: "MW", dialCode: "+265", defaultTimezone: "Africa/Blantyre", placeholder: "991 23 45 67", flag: "🇲🇼" },
  "Malaysia": { code: "MY", dialCode: "+60", defaultTimezone: "Asia/Kuala_Lumpur", placeholder: "12 345 6789", flag: "🇲🇾" },
  "Maldives": { code: "MV", dialCode: "+960", defaultTimezone: "Indian/Maldives", placeholder: "712 3456", flag: "🇲🇻" },
  "Mali": { code: "ML", dialCode: "+223", defaultTimezone: "Africa/Bamako", placeholder: "65 12 34 56", flag: "🇲🇱" },
  "Malta": { code: "MT", dialCode: "+356", defaultTimezone: "Europe/Malta", placeholder: "9912 3456", flag: "🇲🇹" },
  "Marshall Islands": { code: "MH", dialCode: "+692", defaultTimezone: "Pacific/Majuro", placeholder: "235 1234", flag: "🇲🇭" },
  "Mauritania": { code: "MR", dialCode: "+222", defaultTimezone: "Africa/Nouakchott", placeholder: "22 12 34 56", flag: "🇲🇷" },
  "Mauritius": { code: "MU", dialCode: "+230", defaultTimezone: "Indian/Mauritius", placeholder: "5123 4567", flag: "🇲🇺" },
  "Mexico": { code: "MX", dialCode: "+52", defaultTimezone: "America/Mexico_City", placeholder: "55 1234 5678", flag: "🇲🇽" },
  "Micronesia": { code: "FM", dialCode: "+691", defaultTimezone: "Pacific/Pohnpei", placeholder: "920 1234", flag: "🇫🇲" },
  "Moldova": { code: "MD", dialCode: "+373", defaultTimezone: "Europe/Chisinau", placeholder: "621 12 345", flag: "🇲🇩" },
  "Monaco": { code: "MC", dialCode: "+377", defaultTimezone: "Europe/Monaco", placeholder: "6 12 34 56 78", flag: "🇲🇨" },
  "Mongolia": { code: "MN", dialCode: "+976", defaultTimezone: "Asia/Ulaanbaatar", placeholder: "8812 3456", flag: "🇲🇳" },
  "Montenegro": { code: "ME", dialCode: "+382", defaultTimezone: "Europe/Podgorica", placeholder: "67 123 456", flag: "🇲🇪" },
  "Morocco": { code: "MA", dialCode: "+212", defaultTimezone: "Africa/Casablanca", placeholder: "612 34 56 78", flag: "🇲🇦" },
  "Mozambique": { code: "MZ", dialCode: "+258", defaultTimezone: "Africa/Maputo", placeholder: "82 123 4567", flag: "🇲🇿" },
  "Myanmar": { code: "MM", dialCode: "+95", defaultTimezone: "Asia/Yangon", placeholder: "9 123 456 789", flag: "🇲🇲" },
  "Namibia": { code: "NA", dialCode: "+264", defaultTimezone: "Africa/Windhoek", placeholder: "81 123 4567", flag: "🇳🇦" },
  "Nauru": { code: "NR", dialCode: "+674", defaultTimezone: "Pacific/Nauru", placeholder: "555 1234", flag: "🇳🇷" },
  "Nepal": { code: "NP", dialCode: "+977", defaultTimezone: "Asia/Kathmandu", placeholder: "984 1234567", flag: "🇳🇵" },
  "Netherlands": { code: "NL", dialCode: "+31", defaultTimezone: "Europe/Amsterdam", placeholder: "6 12345678", flag: "🇳🇱" },
  "New Zealand": { code: "NZ", dialCode: "+64", defaultTimezone: "Pacific/Auckland", placeholder: "21 123 4567", flag: "🇳🇿" },
  "Nicaragua": { code: "NI", dialCode: "+505", defaultTimezone: "America/Managua", placeholder: "8123 4567", flag: "🇳🇮" },
  "Niger": { code: "NE", dialCode: "+227", defaultTimezone: "Africa/Niamey", placeholder: "90 12 34 56", flag: "🇳🇪" },
  "Nigeria": { code: "NG", dialCode: "+234", defaultTimezone: "Africa/Lagos", placeholder: "802 123 4567", flag: "🇳🇬" },
  "North Korea": { code: "KP", dialCode: "+850", defaultTimezone: "Asia/Pyongyang", placeholder: "191 234 5678", flag: "🇰🇵" },
  "North Macedonia": { code: "MK", dialCode: "+389", defaultTimezone: "Europe/Skopje", placeholder: "72 123 456", flag: "🇲🇰" },
  "Norway": { code: "NO", dialCode: "+47", defaultTimezone: "Europe/Oslo", placeholder: "412 34 567", flag: "🇳🇴" },
  "Oman": { code: "OM", dialCode: "+968", defaultTimezone: "Asia/Muscat", placeholder: "9123 4567", flag: "🇴🇲" },
  "Pakistan": { code: "PK", dialCode: "+92", defaultTimezone: "Asia/Karachi", placeholder: "300 1234567", flag: "🇵🇰" },
  "Palau": { code: "PW", dialCode: "+680", defaultTimezone: "Pacific/Palau", placeholder: "775 1234", flag: "🇵🇼" },
  "Palestine": { code: "PS", dialCode: "+970", defaultTimezone: "Asia/Gaza", placeholder: "59 912 3456", flag: "🇵🇸" },
  "Panama": { code: "PA", dialCode: "+507", defaultTimezone: "America/Panama", placeholder: "6123 4567", flag: "🇵🇦" },
  "Papua New Guinea": { code: "PG", dialCode: "+675", defaultTimezone: "Pacific/Port_Moresby", placeholder: "7012 3456", flag: "🇵🇬" },
  "Paraguay": { code: "PY", dialCode: "+595", defaultTimezone: "America/Asuncion", placeholder: "981 123456", flag: "🇵🇾" },
  "Peru": { code: "PE", dialCode: "+51", defaultTimezone: "America/Lima", placeholder: "912 345 678", flag: "🇵🇪" },
  "Philippines": { code: "PH", dialCode: "+63", defaultTimezone: "Asia/Manila", placeholder: "917 123 4567", flag: "🇵🇭" },
  "Poland": { code: "PL", dialCode: "+48", defaultTimezone: "Europe/Warsaw", placeholder: "512 345 678", flag: "🇵🇱" },
  "Portugal": { code: "PT", dialCode: "+351", defaultTimezone: "Europe/Lisbon", placeholder: "912 345 678", flag: "🇵🇹" },
  "Qatar": { code: "QA", dialCode: "+974", defaultTimezone: "Asia/Qatar", placeholder: "3312 3456", flag: "🇶🇦" },
  "Romania": { code: "RO", dialCode: "+40", defaultTimezone: "Europe/Bucharest", placeholder: "712 345 678", flag: "🇷🇴" },
  "Russia": { code: "RU", dialCode: "+7", defaultTimezone: "Europe/Moscow", placeholder: "912 345-67-89", flag: "🇷🇺" },
  "Rwanda": { code: "RW", dialCode: "+250", defaultTimezone: "Africa/Kigali", placeholder: "788 123 456", flag: "🇷🇼" },
  "Saint Kitts and Nevis": { code: "KN", dialCode: "+1", defaultTimezone: "America/St_Kitts", placeholder: "(869) 762-1234", flag: "🇰🇳" },
  "Saint Lucia": { code: "LC", dialCode: "+1", defaultTimezone: "America/St_Lucia", placeholder: "(758) 712-1234", flag: "🇱🇨" },
  "Saint Vincent and the Grenadines": { code: "VC", dialCode: "+1", defaultTimezone: "America/St_Vincent", placeholder: "(784) 492-1234", flag: "🇻🇨" },
  "Samoa": { code: "WS", dialCode: "+685", defaultTimezone: "Pacific/Apia", placeholder: "72 12345", flag: "🇼🇸" },
  "San Marino": { code: "SM", dialCode: "+378", defaultTimezone: "Europe/San_Marino", placeholder: "66 123456", flag: "🇸🇲" },
  "Sao Tome and Principe": { code: "ST", dialCode: "+239", defaultTimezone: "Africa/Sao_Tome", placeholder: "981 2345", flag: "🇸🇹" },
  "Saudi Arabia": { code: "SA", dialCode: "+966", defaultTimezone: "Asia/Riyadh", placeholder: "50 123 4567", flag: "🇸🇦" },
  "Senegal": { code: "SN", dialCode: "+221", defaultTimezone: "Africa/Dakar", placeholder: "77 123 45 67", flag: "🇸🇳" },
  "Serbia": { code: "RS", dialCode: "+381", defaultTimezone: "Europe/Belgrade", placeholder: "60 123 4567", flag: "🇷🇸" },
  "Seychelles": { code: "SC", dialCode: "+248", defaultTimezone: "Indian/Mahe", placeholder: "2 51 23 45", flag: "🇸🇨" },
  "Sierra Leone": { code: "SL", dialCode: "+232", defaultTimezone: "Africa/Freetown", placeholder: "76 123456", flag: "🇸🇱" },
  "Singapore": { code: "SG", dialCode: "+65", defaultTimezone: "Asia/Singapore", placeholder: "8123 4567", flag: "🇸🇬" },
  "Slovakia": { code: "SK", dialCode: "+421", defaultTimezone: "Europe/Bratislava", placeholder: "912 345 678", flag: "🇸🇰" },
  "Slovenia": { code: "SI", dialCode: "+386", defaultTimezone: "Europe/Ljubljana", placeholder: "41 234 567", flag: "🇸🇮" },
  "Solomon Islands": { code: "SB", dialCode: "+677", defaultTimezone: "Pacific/Guadalcanal", placeholder: "74 12345", flag: "🇸🇧" },
  "Somalia": { code: "SO", dialCode: "+252", defaultTimezone: "Africa/Mogadishu", placeholder: "61 234 5678", flag: "🇸🇴" },
  "South Africa": { code: "ZA", dialCode: "+27", defaultTimezone: "Africa/Johannesburg", placeholder: "71 123 4567", flag: "🇿🇦" },
  "South Korea": { code: "KR", dialCode: "+82", defaultTimezone: "Asia/Seoul", placeholder: "10 1234 5678", flag: "🇰🇷" },
  "South Sudan": { code: "SS", dialCode: "+211", defaultTimezone: "Africa/Juba", placeholder: "912 345 678", flag: "🇸🇸" },
  "Spain": { code: "ES", dialCode: "+34", defaultTimezone: "Europe/Madrid", placeholder: "612 34 56 78", flag: "🇪🇸" },
  "Sri Lanka": { code: "LK", dialCode: "+94", defaultTimezone: "Asia/Colombo", placeholder: "71 234 5678", flag: "🇱🇰" },
  "Sudan": { code: "SD", dialCode: "+249", defaultTimezone: "Africa/Khartoum", placeholder: "91 234 5678", flag: "🇸🇩" },
  "Suriname": { code: "SR", dialCode: "+597", defaultTimezone: "America/Paramaribo", placeholder: "741 2345", flag: "🇸🇷" },
  "Sweden": { code: "SE", dialCode: "+46", defaultTimezone: "Europe/Stockholm", placeholder: "70 123 45 67", flag: "🇸🇪" },
  "Switzerland": { code: "CH", dialCode: "+41", defaultTimezone: "Europe/Zurich", placeholder: "79 123 45 67", flag: "🇨🇭" },
  "Syria": { code: "SY", dialCode: "+963", defaultTimezone: "Asia/Damascus", placeholder: "944 123 456", flag: "🇸🇾" },
  "Taiwan": { code: "TW", dialCode: "+886", defaultTimezone: "Asia/Taipei", placeholder: "912 345 678", flag: "🇹🇼" },
  "Tajikistan": { code: "TJ", dialCode: "+992", defaultTimezone: "Asia/Dushanbe", placeholder: "91 234 5678", flag: "🇹🇯" },
  "Tanzania": { code: "TZ", dialCode: "+255", defaultTimezone: "Africa/Dar_es_Salaam", placeholder: "712 345 678", flag: "🇹🇿" },
  "Thailand": { code: "TH", dialCode: "+66", defaultTimezone: "Asia/Bangkok", placeholder: "81 234 5678", flag: "🇹🇭" },
  "Timor-Leste": { code: "TL", dialCode: "+670", defaultTimezone: "Asia/Dili", placeholder: "7712 3456", flag: "🇹🇱" },
  "Togo": { code: "TG", dialCode: "+228", defaultTimezone: "Africa/Lome", placeholder: "90 12 34 56", flag: "🇹🇬" },
  "Tonga": { code: "TO", dialCode: "+676", defaultTimezone: "Pacific/Tongatapu", placeholder: "771 2345", flag: "🇹🇴" },
  "Trinidad and Tobago": { code: "TT", dialCode: "+1", defaultTimezone: "America/Port_of_Spain", placeholder: "(868) 291-1234", flag: "🇹🇹" },
  "Tunisia": { code: "TN", dialCode: "+216", defaultTimezone: "Africa/Tunis", placeholder: "20 123 456", flag: "🇹🇳" },
  "Turkey": { code: "TR", dialCode: "+90", defaultTimezone: "Europe/Istanbul", placeholder: "532 123 4567", flag: "🇹🇷" },
  "Turkmenistan": { code: "TM", dialCode: "+993", defaultTimezone: "Asia/Ashgabat", placeholder: "65 123456", flag: "🇹🇲" },
  "Tuvalu": { code: "TV", dialCode: "+688", defaultTimezone: "Pacific/Funafuti", placeholder: "901234", flag: "🇹🇻" },
  "Uganda": { code: "UG", dialCode: "+256", defaultTimezone: "Africa/Kampala", placeholder: "712 345678", flag: "🇺🇬" },
  "Ukraine": { code: "UA", dialCode: "+380", defaultTimezone: "Europe/Kyiv", placeholder: "50 123 4567", flag: "🇺🇦" },
  "United Arab Emirates": { code: "AE", dialCode: "+971", defaultTimezone: "Asia/Dubai", placeholder: "50 123 4567", flag: "🇦🇪" },
  "United Kingdom": { code: "GB", dialCode: "+44", defaultTimezone: "Europe/London", placeholder: "7911 123456", flag: "🇬🇧" },
  "United States": { code: "US", dialCode: "+1", defaultTimezone: "America/New_York", placeholder: "(555) 000-0000", flag: "🇺🇸" },
  "Uruguay": { code: "UY", dialCode: "+598", defaultTimezone: "America/Montevideo", placeholder: "99 123 456", flag: "🇺🇾" },
  "Uzbekistan": { code: "UZ", dialCode: "+998", defaultTimezone: "Asia/Tashkent", placeholder: "90 123 45 67", flag: "🇺🇿" },
  "Vanuatu": { code: "VU", dialCode: "+678", defaultTimezone: "Pacific/Efate", placeholder: "551 2345", flag: "🇻🇺" },
  "Vatican City": { code: "VA", dialCode: "+39", defaultTimezone: "Europe/Vatican", placeholder: "312 345 6789", flag: "🇻🇦" },
  "Venezuela": { code: "VE", dialCode: "+58", defaultTimezone: "America/Caracas", placeholder: "412 1234567", flag: "🇻🇪" },
  "Vietnam": { code: "VN", dialCode: "+84", defaultTimezone: "Asia/Ho_Chi_Minh", placeholder: "91 234 5678", flag: "🇻🇳" },
  "Yemen": { code: "YE", dialCode: "+967", defaultTimezone: "Asia/Aden", placeholder: "71 234 567", flag: "🇾🇪" },
  "Zambia": { code: "ZM", dialCode: "+260", defaultTimezone: "Africa/Lusaka", placeholder: "97 1234567", flag: "🇿🇲" },
  "Zimbabwe": { code: "ZW", dialCode: "+263", defaultTimezone: "Africa/Harare", placeholder: "71 234 5678", flag: "🇿🇼" }
};

export function getCountryData(countryName?: string | null): CountryData {
  const name = (countryName || "").trim();
  const meta = (name && COUNTRY_METADATA[name]) || COUNTRY_METADATA["India"];
  return {
    name: name || "India",
    code: meta?.code || "IN",
    dialCode: meta?.dialCode || "+91",
    defaultTimezone: meta?.defaultTimezone || "Asia/Kolkata",
    placeholder: meta?.placeholder || "98765 43210",
    flag: meta?.flag || "🇮🇳",
  };
}

export function getCountryOptions(): { value: string; label: string; searchKey: string }[] {
  return COUNTRIES.map((c) => {
    const meta = getCountryData(c);
    return {
      value: c,
      label: `${meta.flag} ${c} (${meta.dialCode})`,
      searchKey: `${c} ${meta.code} ${meta.dialCode} ${meta.dialCode.replace("+", "")}`.toLowerCase(),
    };
  });
}

export function findCountryByTimezone(tz: string): string {
  const cleanTz = canonicalizeTimezone(tz);
  for (const [countryName, meta] of Object.entries(COUNTRY_METADATA)) {
    if (meta.defaultTimezone === cleanTz) {
      return countryName;
    }
  }
  if (cleanTz.startsWith("Asia/Kolkata") || cleanTz === "Asia/Calcutta") return "India";
  if (cleanTz === "Asia/Dubai") return "United Arab Emirates";
  if (cleanTz.startsWith("America/New_York") || cleanTz.startsWith("America/Chicago") || cleanTz.startsWith("America/Denver") || cleanTz.startsWith("America/Los_Angeles") || cleanTz.startsWith("America/Phoenix")) return "United States";
  if (cleanTz.startsWith("America/Toronto") || cleanTz.startsWith("America/Vancouver") || cleanTz.startsWith("America/Montreal")) return "Canada";
  if (cleanTz.startsWith("Europe/London")) return "United Kingdom";
  if (cleanTz.startsWith("Australia/")) return "Australia";
  if (cleanTz.startsWith("Asia/Singapore")) return "Singapore";
  if (cleanTz.startsWith("Asia/Riyadh")) return "Saudi Arabia";
  if (cleanTz.startsWith("Europe/Berlin")) return "Germany";
  if (cleanTz.startsWith("Europe/Paris")) return "France";
  if (cleanTz.startsWith("Asia/Tokyo")) return "Japan";
  return "India";
}



export interface TimezoneOption {
  value: string;
  label: string;
  searchKey: string;
}

const FALLBACK_TIMEZONES = [
  "Africa/Cairo",
  "Africa/Casablanca",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Anchorage",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Phoenix",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Almaty",
  "Asia/Amman",
  "Asia/Baghdad",
  "Asia/Baku",
  "Asia/Bangkok",
  "Asia/Beirut",
  "Asia/Colombo",
  "Asia/Dhaka",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Istanbul",
  "Asia/Jakarta",
  "Asia/Jerusalem",
  "Asia/Karachi",
  "Asia/Kathmandu",
  "Asia/Kolkata",
  "Asia/Kuwait",
  "Asia/Manila",
  "Asia/Muscat",
  "Asia/Qatar",
  "Asia/Riyadh",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Tashkent",
  "Asia/Tbilisi",
  "Asia/Tehran",
  "Asia/Tokyo",
  "Asia/Yerevan",
  "Atlantic/Reykjavik",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Athens",
  "Europe/Berlin",
  "Europe/Brussels",
  "Europe/Budapest",
  "Europe/Copenhagen",
  "Europe/Dublin",
  "Europe/Helsinki",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Oslo",
  "Europe/Paris",
  "Europe/Prague",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Vienna",
  "Europe/Warsaw",
  "Europe/Zurich",
  "Pacific/Auckland",
  "Pacific/Fiji",
  "Pacific/Honolulu",
  "UTC",
];

function getTimezoneOffsetString(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === "timeZoneName");
    return offsetPart ? offsetPart.value : "";
  } catch {
    return "";
  }
}

export function canonicalizeTimezone(tz: string): string {
  if (tz === "Asia/Calcutta") return "Asia/Kolkata";
  return tz;
}

/**
 * Returns formatted IANA timezones with offset and search keywords.
 */
export function getTimezones(): TimezoneOption[] {
  let list: string[] = [];

  if (typeof Intl !== "undefined" && typeof (Intl as any).supportedValuesOf === "function") {
    try {
      list = (Intl as any).supportedValuesOf("timeZone");
    } catch {
      list = FALLBACK_TIMEZONES;
    }
  } else {
    list = FALLBACK_TIMEZONES;
  }

  if (!list || list.length === 0) {
    list = FALLBACK_TIMEZONES;
  }

  const seen = new Set<string>();
  const options: TimezoneOption[] = [];

  for (const rawTz of list) {
    const tz = canonicalizeTimezone(rawTz);
    if (seen.has(tz)) continue;
    seen.add(tz);

    const offset = getTimezoneOffsetString(tz);
    const city = tz.split("/").pop()?.replace(/_/g, " ") || tz;
    const label = offset ? `${tz} (${offset})` : tz;
    const searchKey = `${tz} ${city} ${offset}`.toLowerCase();
    options.push({
      value: tz,
      label,
      searchKey,
    });
  }

  return options;
}
