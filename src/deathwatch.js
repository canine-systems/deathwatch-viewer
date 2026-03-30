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
    dateObjectStore = "dates";
    keyPath = "timestamp";

    constructor() {
        //this.loadDatabase();
        this.resetDatabase();
    }

    get deaths() {
        return [
            ["March 29 2026", [
                new Death({"dimension":"minecraft:overworld","killer":null,"message":"Thranos drowned","timestamp":"2026-03-29T23:13:10.130Z","type":"drown","victim":{"UUID":"90f12ecd-0abd-4849-a616-c005805fc332","displayName":"Thranos"}})
            ]]
        ]
    }

    loadDatabase() {
        let openRequest = indexedDB.open(this.dbName, this.dbVersion);

        openRequest.onupgradeneeded = (evt) => this.upgrade(evt);
        openRequest.onerror = (evt) => this.error(evt);
        openRequest.onsuccess = (evt) => this.success(evt);
    }

    resetDatabase() {
        let deleteRequest = indexedDB.deleteDatabase(this.dbName);
        deleteRequest.onsuccess = () => this.loadDatabase();
    }

    // Set up the database.
    upgrade(evt) {
        let db = evt.target.result;

        if (evt.oldVersion != 0) {
            // If we're inintializing the database, but it was already initialized,
            // remove the old one.
            this.resetDatabase();
            return;
        }

        db.createObjectStore(this.objectStore, {keyPath: this.keyPath});
        db.createObjectStore(this.dateObjectStore, {keyPath: "date"});
    }

    // Runs when the database open request encounters an error.
    error(err) {
        throw new Error(this.openRequest.error);
    }

    // Runs when the database is successfully loaded.
    success(evt) {
        console.log("start success");
        let db = evt.target.result;

        this.death_files().then(files => {
            console.log(files);
            files.forEach(f => this.load_death_file(db, f));
        });
        console.log("end   success");
    }

    load_death_file(db, file) {
        console.log("load_death_file(" + db.toString() + ", " + file.toString() + ")");
        fetch(file).then(result => result.text()).then(jsonl => {
            let new_deaths = jsonl.trim().split("\n").map(JSON.parse);

            let transaction = db.transaction([this.objectStore, this.dateObjectStore], "readwrite");
            let deaths = transaction.objectStore(this.objectStore);
            let dates = transaction.objectStore(this.dateObjectStore);

            new_deaths.forEach(death => {
                let date = new Date(death["timestamp"]);
                death["date"] = date.getFullYear() + "-" +
                    date.getMonth().toString().padStart(2, "0") + "-" +
                    date.getDate().toString().padStart(2, "0");

                let date_request = dates.put({"date": death["date"]});
                date_request.onsuccess = () => console.log("Adding date: ", date_request.result);
                date_request.onerror = () => console.log("Error adding date: ", date_request.error);

                let request = deaths.put(death);
                request.onsuccess = () => console.log("Added death: ", request.result);
                request.onerror = () => console.log("Error adding death: ", request.error);
            });
        });
    }

    async death_files() {
        const years = await this.files("/deathwatch/");
        const months = await Promise.all(years.flatMap(y => this.files(y)));
        const days = await Promise.all(months.flatMap(m => this.files(m)));

        return days.flat();
    }

    async files(path) {
        if (!path)
            throw new Error("Expected 'path' to be a string, not " + path.toString());

        const response = await fetch(path, {headers: {"Accept": "application/json"}});
        if (!response.ok) {
            throw new Error("Failed to load " + path);
        }

        const result = await response.json();
        return result.flatMap(entry => {
            const entry_path = path + entry["name"];
            return entry_path;
        });
    }
}
