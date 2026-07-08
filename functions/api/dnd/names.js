const FALLBACK = {
  human: {
    first: ["Aldric", "Mira", "Joss", "Bryn", "Tam", "Elowen", "Garret", "Sable", "Wren", "Cole"],
    last: ["Hale", "Brightwater", "Stone", "Marsh", "Vance", "Crane", "Holloway", "Pike"],
  },
  elf: {
    first: ["Aelar", "Sylvaen", "Thessaly", "Faen", "Lúthais", "Nimue", "Erevan", "Ysolde"],
    last: ["Moonwhisper", "Silverbough", "Duskwalker", "Starfall", "Nightbreeze"],
  },
  dwarf: {
    first: ["Borin", "Dagna", "Thrain", "Hilda", "Korgan", "Vondal", "Brunhild", "Durik"],
    last: ["Ironfist", "Stonebeard", "Deepdelver", "Forgeheart", "Granitecask"],
  },
  goblinoid: {
    first: ["Snik", "Graz", "Mott", "Yek", "Drub", "Skib", "Narg", "Vexx"],
    last: ["the Sly", "Bonechew", "Quickblade", "Ratsbane", "the Lesser"],
  },
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

export async function onRequest(context) {
  const { request } = context
  try {
    if (request.method === "GET") {
      const url = new URL(request.url)
      const race = (url.searchParams.get("race") ?? "human").toLowerCase()
      const count = Math.max(1, Math.min(12, Number(url.searchParams.get("count") ?? 6)))

      const table = FALLBACK[race] ?? FALLBACK.human
      const names = []
      const seen = new Set()
      let guard = 0
      while (names.length < count && guard < 100) {
        guard++
        const n = `${pick(table.first)} ${pick(table.last)}`
        if (!seen.has(n)) { seen.add(n); names.push(n) }
      }
      return Response.json({ source: "local", race, names })
    }

    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 })
  } catch (e) {
    return Response.json({ ok: false, error: e.message || "Internal error" }, { status: 500 })
  }
}
