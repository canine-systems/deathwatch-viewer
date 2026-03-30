class Player {
    UUID;
    displayName;
    avatarUrl;

    constructor(UUID, displayName) {
        this.UUID = UUID;
        this.displayName = displayName;
        this.avatarUrl = "https://mc-heads.net/avatar/" + this.UUID;
    }

    get avatarImg() {
        var img = new Image();
        img.src = this.avatarUrl;
        img.classList.add("avatar");
        return img;
    }

    toHTML() {
        let span = document.createElement("span");
        span.appendChild(this.avatarImg);
span.append(" ");
        span.append(this.displayName);

        return span;
    }
}

class Timestamp {
    constructor(timestamp) {
        this.timestamp = timestamp;
        this.datetime = new Date(timestamp);
    }

    toHTML() {
        let time = document.createElement("time");
        time.setAttribute("datetime", this.timestamp);
        time.innerText = this.datetime.toLocaleTimeString();
        return time;
    }
}

class Death {
    dimension;
    killer;
    message;
    timestamp;
    type;
    victim;

    constructor(obj) {
        this.dimension = obj["dimension"];
        this.killer = obj["killer"];
        this.message = obj["message"];
        this.timestamp = new Timestamp(obj["timestamp"]);
        this.type = obj["type"];

        var victim = obj["victim"];
        this.victim = new Player(victim["UUID"], victim["displayName"]);
    }
}

class DeathwatchTable {
    constructor() {
        this.deathwatch = new Deathwatch();
        this.tableTemplate = document.querySelector("script[type=deathwatch-table-template]").innerHTML;
    }

    load() {
        this.deathwatch.deaths.forEach(([date, deaths]) => {
            let table = new DOMParser().parseFromString(this.tableTemplate, 'text/html').body.children[0];
            let tableBody = table.getElementsByTagName("tbody")[0];
            let columns = table.getAttribute("deathwatch-table-order").split(",");

            console.log(deaths);
            deaths.forEach(death => {
                let tr = document.createElement("tr");
                columns.forEach(col => {
                    let td = document.createElement("td");

                    var value = death[col];

                    if (col == "victim-avatar") {
                        td.appendChild(death.victim.avatarImg);
                    } else if (value && typeof value["toHTML"] == "function") {
                        td.appendChild(value.toHTML());
                    } else {
                        td.innerText = value;
                    }

                    tr.appendChild(td);
                });
                tableBody.appendChild(tr);
            });

            let details = document.createElement("details");
            let summary = document.createElement("summary");
            summary.innerText = date;
            details.setAttribute("open", "open");
            details.setAttribute("name", "deathwatch-table");
            details.appendChild(summary);
            details.appendChild(table);
            document.body.getElementsByTagName("main")[0].appendChild(details);
        });
    }
}

class Deathwatch {
    dbName = "deathwatch";
    dbVersion = 1; // increase this to force all clients to re-generate

    objectStore = "deaths";
    keyPath = "timestamp";

    constructor() {
        this.loadDatabase();
    }

    get deaths() {
        return [
            ["March 29 2026", [
                new Death({"dimension":"minecraft:overworld","killer":null,"message":"Thranos drowned","timestamp":"2026-03-29T23:13:10.130Z","type":"drown","victim":{"UUID":"90f12ecd-0abd-4849-a616-c005805fc332","displayName":"Thranos"}})
            ]]
        ]
    }

    loadDatabase() {
        this.openRequest = indexedDB.open(this.dbName, this.dbVersion);

        this.openRequest.onupgradeneeded = this.upgrade;
        this.openRequest.onerror = this.error;
        this.openRequest.onsuccess = this.success;

        window.openRequest = this.openRequest;
        console.log(this.openRequest);
    }

    resetDatabase() {
        let deleteRequest = indexedDB.deleteDatabase(this.dbName);
        deleteRequest.onsuccess(evt => loadDatabase());
    }

    // Set up the database.
    upgrade(evt) {
        let db = this.openRequest.result;

        if (evt.oldVersion != 0) {
            // If we're inintializing the database, but it was already initialized,
            // remove the old one.
            this.resetDatabase();
            return;
        }

        db.createObjectStore(this.objectStore, {keyPath: this.keyPath});
    }

    // Runs when the database open request encounters an error.
    error(err) {
        throw new Error(this.openRequest.error);
    }

    // Runs when the database is successfully loaded.
    success() {
        let db = this.openRequest.result;

        console.log(db);

        this.death_files().then(files => {
            files.forEach(f => this.load_death_file(db, f));
        });
    }

    load_death_file(db, file) {
        console.log("load_death_file(" + db.toString() + ", " + file.toString() + ")");
        let new_deaths = fetch(file).then(jsonl => {
            console.log(jsonl);
            jsonl.split("\n").map(JSON.parse)});

        let transaction = db.transaction(this.objectStore, "readwrite");
        let deaths = transaction.objectStore("deaths");

        new_deaths.forEach(death => {
            console.log("put " + death);
            let request = deaths.put(death);
            request.onsuccess = function() {
                console.log("Added death: ", request.result);
            };
            request.onerror = function() {
                console.log("Error adding death: ", request.error);
            };
        });
    }

    async death_files() {
        const years = await this.files("/deathwatch/");
        const months = await Promise.all(years.flatMap(y => this.files(y)));
        const days = await Promise.all(months.flatMap(m => this.files(m)));

        return days
    }

    async files(path) {
        if (!path)
            throw new Error("Expected 'path' to be a string, not " + path.toString());

        const response = await fetch(path, {headers: {"Accept": "application/json"}});
        if (!response.ok) {
            throw new Error("Failed to load " + path);
        }

        const result = await response.json();
        return result.map(entry => {
            const entry_path = path + entry["name"];
            return entry_path;
        });
    }
}
