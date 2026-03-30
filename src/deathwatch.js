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
        this.deathwatch.loadDeaths((date, deaths) => {
            let table = new DOMParser().parseFromString(this.tableTemplate, 'text/html').body.children[0];
            let tableBody = table.getElementsByTagName("tbody")[0];
            let columns = table.getAttribute("deathwatch-table-order").split(",");

            deaths.forEach(death => {
                death = new Death(death);
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
    }

    loadDeaths(callback) {
        this.resetDatabase().then(() => {
            this.success(callback).then(() => {
                // lol, why the fuck do i need to do this twice
                this.success(callback).then(() => {})
            })
        });
    }

    resetDatabase() {
        return idb.deleteDB(this.dbName);
    }

    async open_db() {
        return await idb.openDB(this.dbName, this.dbVersion, {
            upgrade: (db, oldVersion, newVersion, transaction, event) => {
                if (oldVersion != 0)
                    resetDatabase();

                db.createObjectStore(this.objectStore, {keyPath: this.keyPath});
                db.createObjectStore(this.dateObjectStore, {keyPath: "date"});
            }
        })
    }

    // Runs when the database is successfully loaded.
    async success(loadCallback) {
        const db = await this.open_db();
        let dates = (await db.getAll(this.dateObjectStore)) || [];
        let lastDate = dates.length ? dates[dates.length - 1] : null;
        dates.reverse();

        console.log("before this.death_files()");
        let files = await this.death_files();
        for await (const file of files) {
            await this.load_death_file(db, file, dates, lastDate);
        }

        console.log("for await", dates);
        for await (const date of dates) {
            console.log("  date", date);
            var startDate = new Date(date["date"]);
            let endDate = new Date();
            endDate.setDate(startDate.getDate() + 1);
            let startDateStr = this.formatDate(startDate).replaceAll("/", "-");
            let endDateStr = this.formatDate(endDate).replaceAll("/", "-");
            console.log("dates", startDateStr, endDateStr);
            let dateRange = IDBKeyRange.bound(startDateStr, endDateStr);

            let deaths = (await db.getAll(this.objectStore, dateRange)) || [];

            console.log("loadCallback(", startDate.toLocaleString(), ", ", deaths);
            loadCallback(startDate.toLocaleString().split(',')[0], deaths);
        }
    }

    async load_death_file(db, file, dates, last_date) {
        console.log("load_death_file(" + db.toString() + ", " + file.toString() + ")");

        let file_date = file.split("/").slice(2).join("/").split(".")[0];
        if (dates.includes(file_date) && last_date != file_date) {
            console.log("Already stored info for", file_date);
            return;
        } else {
            console.log("Loading deaths for", file_date);
        }

        let result = await fetch(file);
        let text = await result.text();
        let new_deaths = text.trim().split("\n").map(JSON.parse);

        let transaction = db.transaction([this.objectStore, this.dateObjectStore], "readwrite");
        let deathStore = transaction.objectStore(this.objectStore);
        let dateStore = transaction.objectStore(this.dateObjectStore);

        await Promise.all(new_deaths.map(async death => {
            let date = new Date(death["timestamp"]);
            death["date"] = this.formatDate(date);

            await dateStore.put({"date": death["date"]});
            await deathStore.put(death);
        }));
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

    formatDate(date) {
        return date.getFullYear() + "/" +
            (date.getMonth() + 1).toString().padStart(2, "0") + "/" +
            date.getDate().toString().padStart(2, "0");
    }
}
