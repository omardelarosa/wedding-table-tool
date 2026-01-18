const canvas = document.getElementById("graphCanvas");
const ctx = canvas.getContext("2d");
let nodes = [];
let connections = [];
let selectedNode = null;
let draggedNode = null;
let dragOffset = { x: 0, y: 0 };
let isDragging = false;
let mouseDownPos = { x: 0, y: 0 };

// Initialize viewport dimensions on load
window.onload = () => {
    document.getElementById("canvasW").value = window.innerWidth - 100;
    document.getElementById("canvasH").value = window.innerHeight - 220;
};

// --- STYLING HELPERS ---
function getGroupColor(group) {
    if (group === "None" || group === "Full" || isNaN(group)) return "#ffffff";
    const hue = (group * 137.5) % 360;
    return `hsl(${hue}, 70%, 90%)`;
}

function getGroupBorder(group) {
    if (group === "None" || group === "Full" || isNaN(group)) return "#0d6efd";
    const hue = (group * 137.5) % 360;
    return `hsl(${hue}, 70%, 40%)`;
}

// --- FILE HANDLING ---
function handleFileUpload() {
    const fileInput = document.getElementById("csvFile");
    if (!fileInput.files.length) return alert("Select CSV.");
    const reader = new FileReader();
    reader.onload = (e) => parseCSV(e.target.result);
    reader.readAsText(fileInput.files[0]);
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
    const headers = lines[0]
        .split(",")
        .map((h) => h.trim().replace(/['"]/g, ""));
    const nIdx = headers.indexOf("Name"),
        fIdx = headers.indexOf("Friends"),
        gIdx = headers.indexOf("Group");

    let rows = lines
        .slice(1)
        .map((l) => {
            const c = l
                .split(",")
                .map((cell) => cell.trim().replace(/['"]/g, ""));
            return {
                name: c[nIdx],
                friends: c[fIdx] || "",
                group:
                    gIdx !== -1 && c[gIdx] !== "" ? parseInt(c[gIdx]) : "None",
            };
        })
        .filter((r) => r.name)
        .sort((a, b) => a.name.localeCompare(b.name));

    initNodes(rows);
}

function initNodes(data) {
    nodes = [];
    connections = [];
    canvas.width = parseInt(document.getElementById("canvasW").value);
    canvas.height = parseInt(document.getElementById("canvasH").value);

    const count = data.length,
        aspect = canvas.width / canvas.height;
    let cols = Math.ceil(Math.sqrt(count * aspect)),
        rowsCnt = Math.ceil(count / cols);
    const cW = canvas.width / cols,
        cH = canvas.height / rowsCnt;

    data.forEach((r, i) => {
        ctx.font = "bold 11px sans-serif";
        nodes.push({
            name: r.name,
            group: r.group,
            x: (i % cols) * cW + cW / 2,
            y: Math.floor(i / cols) * cH + cH / 2,
            width: ctx.measureText(r.name).width + 35,
            height: 34,
            friendsRaw: r.friends,
        });
    });

    nodes.forEach((n) => {
        if (!n.friendsRaw) return;
        n.friendsRaw.split(/[;,]/).forEach((f) => {
            const t = nodes.find(
                (target) => target.name.toLowerCase() === f.trim().toLowerCase()
            );
            if (
                t &&
                t !== n &&
                !connections.some(
                    (c) =>
                        (c.from === n && c.to === t) ||
                        (c.from === t && c.to === n)
                )
            ) {
                connections.push({ from: n, to: t });
            }
        });
    });
    draw();
}

// --- OPTIMIZATION & GROUPING ---
function randomizeGroups() {
    if (nodes.length === 0) return;
    const maxG = parseInt(document.getElementById("maxGroups").value),
        maxS = parseInt(document.getElementById("groupSize").value);
    nodes.forEach((n) => (n.group = "None"));
    const occ = {};
    let unassigned = [...nodes].sort(() => Math.random() - 0.5);
    let cur = 1;
    unassigned.forEach((n) => {
        while (cur <= maxG) {
            if ((occ[cur] || 0) < maxS) {
                n.group = cur;
                occ[cur] = (occ[cur] || 0) + 1;
                break;
            }
            cur++;
        }
        if (n.group === "None") n.group = "Full";
    });
    draw();
}

function optimizeGroups() {
    if (nodes.length === 0) return alert("Load data first.");
    const maxG = parseInt(document.getElementById("maxGroups").value),
        maxS = parseInt(document.getElementById("groupSize").value);
    randomizeGroups();
    let improved = true,
        iterations = 0;
    while (improved && iterations < 100) {
        improved = false;
        iterations++;
        [...nodes]
            .sort(() => Math.random() - 0.5)
            .forEach((node) => {
                let currentPenalty = getNonConnectionCount(node, node.group),
                    bestG = node.group,
                    minP = currentPenalty;
                for (let g = 1; g <= maxG; g++) {
                    if (g === node.group) continue;
                    if (nodes.filter((n) => n.group === g).length < maxS) {
                        let potentialP = getNonConnectionCount(node, g);
                        if (potentialP < minP) {
                            minP = potentialP;
                            bestG = g;
                        }
                    }
                }
                if (bestG !== node.group) {
                    node.group = bestG;
                    improved = true;
                }
            });
    }
    draw();
}

function getNonConnectionCount(node, groupId) {
    const members = nodes.filter((n) => n.group === groupId && n !== node);
    if (members.length === 0) return 0;
    let nonConnections = 0;
    members.forEach((m) => {
        if (
            !connections.some(
                (c) =>
                    (c.from === node && c.to === m) ||
                    (c.from === m && c.to === node)
            )
        )
            nonConnections++;
    });
    return nonConnections;
}

function reorganizeByGroup() {
    nodes.sort((a, b) => {
        const gA = a.group === "None" || a.group === "Full" ? 999 : a.group;
        const gB = b.group === "None" || b.group === "Full" ? 999 : b.group;
        return gA !== gB ? gA - gB : a.name.localeCompare(b.name);
    });
    const c = nodes.length,
        aspect = canvas.width / canvas.height;
    let cols = Math.ceil(Math.sqrt(c * aspect)),
        rowsCnt = Math.ceil(c / cols);
    const cW = canvas.width / cols,
        cH = canvas.height / rowsCnt;
    nodes.forEach((n, i) => {
        n.x = (i % cols) * cW + cW / 2;
        n.y = Math.floor(i / cols) * cH + cH / 2;
    });
    draw();
}

// --- UPDATED DRAW FUNCTION (Labels removed) ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Connection Lines
    ctx.strokeStyle = "#cbd5e0";
    ctx.lineWidth = 1.5;
    connections.forEach((c) => {
        ctx.beginPath();
        ctx.moveTo(c.from.x, c.from.y);
        ctx.lineTo(c.to.x, c.to.y);
        ctx.stroke();
    });

    // 2. Draw Nodes (Group Labels logic removed from here)
    nodes.forEach((n) => {
        const rx = n.x - n.width / 2,
            ry = n.y - n.height / 2;

        ctx.beginPath();
        ctx.roundRect(rx, ry, n.width, n.height, 6);

        ctx.fillStyle = selectedNode === n ? "#fff9db" : getGroupColor(n.group);
        ctx.fill();

        ctx.strokeStyle =
            selectedNode === n ? "#fab005" : getGroupBorder(n.group);
        ctx.lineWidth = selectedNode === n ? 3 : 1.5;
        ctx.stroke();

        ctx.fillStyle = "#212529";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(n.name, n.x, n.y - 5);

        ctx.font = "italic 9px sans-serif";
        ctx.fillStyle = "#495057";
        ctx.fillText(`Group: ${n.group}`, n.x, n.y + 8);
    });
}

// --- NEW RIGHT-CLICK MODAL LOGIC ---
canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault(); // Stop the default browser menu

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Find if a node was right-clicked
    const clickedNode = nodes.find(
        (n) =>
            mx >= n.x - n.width / 2 &&
            mx <= n.x + n.width / 2 &&
            my >= n.y - n.height / 2 &&
            my <= n.y + n.height / 2
    );

    if (clickedNode) {
        const newGroup = prompt(
            `Reassign ${clickedNode.name} to a new group (Number):`,
            clickedNode.group
        );

        if (newGroup !== null) {
            // Check if input is a valid number or "None"/"Full"
            const parsed = parseInt(newGroup);
            clickedNode.group = isNaN(parsed) ? newGroup : parsed;
            draw();
        }
    }
    return false;
});

canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left,
        my = e.clientY - rect.top;
    mouseDownPos = { x: mx, y: my };
    draggedNode = nodes.find(
        (n) =>
            mx >= n.x - n.width / 2 &&
            mx <= n.x + n.width / 2 &&
            my >= n.y - n.height / 2 &&
            my <= n.y + n.height / 2
    );
    if (draggedNode) {
        isDragging = false;
        dragOffset = { x: mx - draggedNode.x, y: my - draggedNode.y };
    }
});

window.addEventListener("mousemove", (e) => {
    if (!draggedNode) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left,
        my = e.clientY - rect.top;
    if (Math.abs(mx - mouseDownPos.x) > 5 || Math.abs(my - mouseDownPos.y) > 5)
        isDragging = true;
    if (isDragging) {
        draggedNode.x = mx - dragOffset.x;
        draggedNode.y = my - dragOffset.y;
        draw();
    }
});

window.addEventListener("mouseup", (e) => {
    if (draggedNode && !isDragging) {
        if (selectedNode && selectedNode !== draggedNode) {
            const idx = connections.findIndex(
                (c) =>
                    (c.from === selectedNode && c.to === draggedNode) ||
                    (c.from === draggedNode && c.to === selectedNode)
            );
            idx !== -1
                ? connections.splice(idx, 1)
                : connections.push({ from: selectedNode, to: draggedNode });
            selectedNode = null;
        } else {
            selectedNode = draggedNode;
        }
        draw();
    }
    draggedNode = null;
    isDragging = false;
});

function exportCSV() {
    let csv = "\uFEFFName,Friends,Group\n";
    nodes.forEach((n) => {
        const f = connections
            .filter((c) => c.from === n || c.to === n)
            .map((c) => (c.from === n ? c.to.name : c.from.name));
        csv += `"${n.name}","${f.join("; ")}","${n.group}"\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "optimized_groups.csv";
    a.click();
}

function findGuest() {
    const query = document
        .getElementById("searchInput")
        .value.toLowerCase()
        .trim();
    if (!query) return;

    const guest = nodes.find((n) => n.name.toLowerCase().includes(query));

    if (guest) {
        // 1. Select the node visually
        selectedNode = guest;

        // 2. Calculate position relative to the viewport
        const viewport = document.getElementById("canvas-viewport");
        const canvasWrapper = document.getElementById("canvas-wrapper");

        // guest.x/y is center of node. We want that centered in the viewport.
        const targetX =
            guest.x + canvasWrapper.offsetLeft - viewport.clientWidth / 2;
        const targetY =
            guest.y + canvasWrapper.offsetTop - viewport.clientHeight / 2;

        // 3. Smooth scroll to the location
        viewport.scrollTo({
            left: targetX,
            top: targetY,
            behavior: "smooth",
        });

        draw();
    } else {
        alert("Guest not found.");
    }
}
