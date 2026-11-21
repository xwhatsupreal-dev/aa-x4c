import { SCRIPT_UPDATED_AT, SCRIPT_VERSION } from '../data/aaCatalog.ts';

export function generateWebSyncLuaScript(
  endpointUrl: string,
  syncKey: string,
  intervalSec = 10,
  showInGameGui = true
): string {
  const endpoint = endpointUrl.trim().replace(/\/$/, '');
  const guiSection = showInGameGui
    ? `
------------------------------------------------------------------
-- 6) MAIN IN-GAME GUI (2K | รางวัล • กระเป๋า • ทีม + ส่งเข้าเว็บ)
------------------------------------------------------------------
local gui = Instance.new("ScreenGui")
gui.Name = "2K_RewardTracker"
gui.ResetOnSpawn = false
gui.DisplayOrder = 85
gui.IgnoreGuiInset = false
pcall(function() gui.Parent = (gethui and gethui()) or PG end)
if not gui.Parent then gui.Parent = PG end

local main = Instance.new("Frame")
main.Size = UDim2.fromOffset(400, 540)
main.Position = UDim2.new(0, 40, 0, 90)
main.BackgroundColor3 = Color3.fromRGB(20, 20, 26)
main.BorderSizePixel = 0
main.Active = true
main.Parent = gui
Instance.new("UICorner", main).CornerRadius = UDim.new(0, 12)
local mstroke = Instance.new("UIStroke", main)
mstroke.Color = Color3.fromRGB(58, 58, 78); mstroke.Thickness = 1

local titleBar = Instance.new("TextButton")
titleBar.Size = UDim2.new(1, 0, 0, 34)
titleBar.BackgroundColor3 = Color3.fromRGB(31, 31, 42)
titleBar.Text = "  2K | AA Vault v" .. SCRIPT_VERSION .. " (ทุก " .. AUTO_SYNC_SEC .. " วิ)"
titleBar.TextXAlignment = Enum.TextXAlignment.Left
titleBar.TextColor3 = Color3.fromRGB(236, 236, 248)
titleBar.Font = Enum.Font.GothamBold
titleBar.TextSize = 13
titleBar.AutoButtonColor = false
titleBar.BorderSizePixel = 0
titleBar.ZIndex = 3
titleBar.Parent = main
Instance.new("UICorner", titleBar).CornerRadius = UDim.new(0, 12)

local function mkBtn(text, xoff, col, cb)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(26, 26)
	b.Position = UDim2.new(1, xoff, 0, 4)
	b.BackgroundColor3 = col
	b.Text = text
	b.TextColor3 = Color3.fromRGB(245, 245, 252)
	b.Font = Enum.Font.GothamBold
	b.TextSize = 14
	b.BorderSizePixel = 0
	b.ZIndex = 5
	b.Parent = main
	Instance.new("UICorner", b).CornerRadius = UDim.new(0, 6)
	b.MouseButton1Click:Connect(cb)
	return b
end
mkBtn("X", -32, Color3.fromRGB(168, 62, 62), function() Hub.Stop() end)
mkBtn("-", -62, Color3.fromRGB(58, 58, 82), function()
	main.Size = main.Size == UDim2.fromOffset(400, 540) and UDim2.fromOffset(400, 34) or UDim2.fromOffset(400, 540)
end)

-- drag
do
	local dragging, startPos, startIn
	titleBar.InputBegan:Connect(function(i)
		if i.UserInputType == Enum.UserInputType.MouseButton1 or i.UserInputType == Enum.UserInputType.Touch then
			dragging = true; startPos = i.Position; startIn = main.Position
		end
	end)
	game:GetService("UserInputService").InputChanged:Connect(function(i)
		if dragging and (i.UserInputType == Enum.UserInputType.MouseMovement or i.UserInputType == Enum.UserInputType.Touch) then
			local d = i.Position - startPos
			main.Position = UDim2.new(startIn.X.Scale, startIn.X.Offset + d.X, startIn.Y.Scale, startIn.Y.Offset + d.Y)
		end
	end)
	game:GetService("UserInputService").InputEnded:Connect(function(i)
		if i.UserInputType == Enum.UserInputType.MouseButton1 or i.UserInputType == Enum.UserInputType.Touch then dragging = false end
	end)
end

local tabBar = Instance.new("Frame")
tabBar.Size = UDim2.new(1, -12, 0, 30)
tabBar.Position = UDim2.fromOffset(6, 40)
tabBar.BackgroundTransparency = 1
tabBar.Parent = main
local tl = Instance.new("UIListLayout", tabBar)
tl.FillDirection = Enum.FillDirection.Horizontal
tl.Padding = UDim.new(0, 6)

local tabBtns = {}
local function mkTab(key, label)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(88, 28)
	b.BackgroundColor3 = Color3.fromRGB(38, 38, 52)
	b.Text = label
	b.TextColor3 = Color3.fromRGB(220, 220, 235)
	b.Font = Enum.Font.GothamBold
	b.TextSize = 12
	b.BorderSizePixel = 0
	b.Parent = tabBar
	Instance.new("UICorner", b).CornerRadius = UDim.new(0, 7)
	b.MouseButton1Click:Connect(function() Hub.Tab = key; Hub.Render() end)
	tabBtns[key] = b
	return b
end
mkTab("team", "ทีม 6 ตัว")
mkTab("drops", "ของที่ได้")
mkTab("bag", "กระเป๋า")

local content = Instance.new("ScrollingFrame")
content.Size = UDim2.new(1, -12, 1, -150)
content.Position = UDim2.fromOffset(6, 74)
content.BackgroundColor3 = Color3.fromRGB(26, 26, 34)
content.BorderSizePixel = 0
content.ScrollBarThickness = 5
content.CanvasSize = UDim2.new(0, 0, 0, 0)
content.AutomaticCanvasSize = Enum.AutomaticSize.Y
content.Parent = main
Instance.new("UICorner", content).CornerRadius = UDim.new(0, 8)
local cl = Instance.new("UIListLayout", content)
cl.Padding = UDim.new(0, 5)
cl.SortOrder = Enum.SortOrder.LayoutOrder
local cp = Instance.new("UIPadding", content)
cp.PaddingTop = UDim.new(0, 6); cp.PaddingLeft = UDim.new(0, 6)
cp.PaddingRight = UDim.new(0, 6); cp.PaddingBottom = UDim.new(0, 6)

-- Primary Web Sync button row
local webRow = Instance.new("Frame")
webRow.Size = UDim2.new(1, -12, 0, 28)
webRow.Position = UDim2.new(0, 6, 1, -108)
webRow.BackgroundTransparency = 1
webRow.Parent = main
local wrl = Instance.new("UIListLayout", webRow)
wrl.FillDirection = Enum.FillDirection.Horizontal
wrl.Padding = UDim.new(0, 6)

local function mkWebBtn(label, w, bg, cb)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(w, 26)
	b.BackgroundColor3 = bg
	b.Text = label
	b.TextColor3 = Color3.fromRGB(255, 255, 255)
	b.Font = Enum.Font.GothamBold
	b.TextSize = 11
	b.BorderSizePixel = 0
	b.Parent = webRow
	Instance.new("UICorner", b).CornerRadius = UDim.new(0, 6)
	b.MouseButton1Click:Connect(cb)
	return b
end

mkWebBtn("คัดลอกข้อมูลเข้าเว็บ (1 คลิก)", 230, Color3.fromRGB(79, 110, 247), function()
	Hub.CopyForWeb()
end)
mkWebBtn("ส่ง HTTP สด", 152, Color3.fromRGB(48, 56, 82), function()
	Hub.HttpBlocked = false
	Hub.SyncToWeb(true)
end)

local actRow = Instance.new("Frame")
actRow.Size = UDim2.new(1, -12, 0, 26)
actRow.Position = UDim2.new(0, 6, 1, -76)
actRow.BackgroundTransparency = 1
actRow.Parent = main
local arl = Instance.new("UIListLayout", actRow)
arl.FillDirection = Enum.FillDirection.Horizontal
arl.Padding = UDim.new(0, 6)

local function mkAct(label, w, cb)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(w, 24)
	b.BackgroundColor3 = Color3.fromRGB(45, 45, 62)
	b.Text = label
	b.TextColor3 = Color3.fromRGB(225, 225, 240)
	b.Font = Enum.Font.GothamBold
	b.TextSize = 11
	b.BorderSizePixel = 0
	b.Parent = actRow
	Instance.new("UICorner", b).CornerRadius = UDim.new(0, 6)
	b.MouseButton1Click:Connect(cb)
	return b
end
mkAct("สแกนใหม่", 118, function() Hub.Profile = nil; Hub.IconLookups = 0; if Hub.ResetInvBaseline then Hub.ResetInvBaseline() end; Hub.Refresh(true) end)
local notifyBtn
notifyBtn = mkAct("แจ้งเตือน: เปิด", 136, function()
	Hub.Flags.Notify = not Hub.Flags.Notify
	notifyBtn.Text = "แจ้งเตือน: " .. (Hub.Flags.Notify and "เปิด" or "ปิด")
end)
mkAct("ล้างประวัติ", 122, function() Hub.Rewards = {}; Hub.Totals = {}; Hub.Render() end)

local footer = Instance.new("TextLabel")
footer.Size = UDim2.new(1, -12, 0, 40)
footer.Position = UDim2.new(0, 6, 1, -46)
footer.BackgroundColor3 = Color3.fromRGB(30, 30, 40)
footer.BorderSizePixel = 0
footer.Font = Enum.Font.Gotham
footer.TextSize = 10
footer.TextWrapped = true
footer.TextColor3 = Color3.fromRGB(200, 200, 215)
footer.Text = "..."
footer.Parent = main
Instance.new("UICorner", footer).CornerRadius = UDim.new(0, 8)

local function clearContent()
	for _, c in ipairs(content:GetChildren()) do
		if c:IsA("Frame") or c:IsA("TextLabel") or c:IsA("TextButton") then c:Destroy() end
	end
end

local function row(parent, h)
	local r = Instance.new("Frame")
	r.Size = UDim2.new(1, 0, 0, h)
	r.BackgroundColor3 = Color3.fromRGB(34, 34, 45)
	r.BorderSizePixel = 0
	r.Parent = parent
	Instance.new("UICorner", r).CornerRadius = UDim.new(0, 7)
	return r
end

local function header(parent, text, col)
	local l = Instance.new("TextLabel")
	l.Size = UDim2.new(1, 0, 0, 22)
	l.BackgroundTransparency = 1
	l.Font = Enum.Font.GothamBold
	l.TextSize = 12
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextColor3 = col or Color3.fromRGB(140, 140, 165)
	l.Text = "  " .. text
	l.Parent = parent
	return l
end

function Hub.Render()
	if not Hub.Running then return end
	clearContent()
	for k, b in pairs(tabBtns) do
		b.BackgroundColor3 = (k == Hub.Tab) and Color3.fromRGB(70, 90, 190) or Color3.fromRGB(38, 38, 52)
	end

	if Hub.Tab == "team" then
		local unitMap = buildUnitMap()
		local team = findEquipped(unitMap)
		Hub.Equipped = team
		header(content, "ทีมที่ใส่ในด่าน (" .. #team .. "/6)")
		if #team == 0 then
			local l = Instance.new("TextLabel")
			l.Size = UDim2.new(1, 0, 0, 44)
			l.BackgroundTransparency = 1
			l.Font = Enum.Font.Gotham
			l.TextSize = 12
			l.TextColor3 = Color3.fromRGB(180, 180, 195)
			l.Text = "ยังตรวจไม่พบทีม — เข้าไปที่ Collection > Teams เลือกทีม 1 ครั้ง\\nแล้วกด 'สแกนใหม่'"
			l.Parent = content
		end
		for i, u in ipairs(team) do
			local r = row(content, 52)
			r.LayoutOrder = i
			local n = Instance.new("TextLabel")
			n.Size = UDim2.new(1, -20, 0, 20)
			n.Position = UDim2.fromOffset(10, 5)
			n.BackgroundTransparency = 1
			n.Font = Enum.Font.GothamBold
			n.TextSize = 13
			n.TextXAlignment = Enum.TextXAlignment.Left
			n.TextColor3 = rcol(u.rarity)
			n.Text = i .. ". " .. u.name .. (u.shiny and "  ✦" or "")
			n.Parent = r
			local s = Instance.new("TextLabel")
			s.Size = UDim2.new(1, -20, 0, 18)
			s.Position = UDim2.fromOffset(10, 26)
			s.BackgroundTransparency = 1
			s.Font = Enum.Font.Gotham
			s.TextSize = 11
			s.TextXAlignment = Enum.TextXAlignment.Left
			s.TextColor3 = Color3.fromRGB(175, 175, 190)
			local traitTxt = (#u.traits > 0) and (" • " .. table.concat(u.traits, ",")) or ""
			s.Text = tostring(u.rarity) .. (u.level and (" • Lv." .. tostring(u.level)) or "") .. traitTxt
			s.Parent = r
		end
	elseif Hub.Tab == "drops" then
		header(content, "ของที่ได้ล่าสุด (" .. #Hub.Rewards .. " รายการ)")
		for i = 1, math.min(#Hub.Rewards, 60) do
			local e = Hub.Rewards[i]
			local r = row(content, 40)
			r.LayoutOrder = i
			local n = Instance.new("TextLabel")
			n.Size = UDim2.new(1, -20, 0, 18)
			n.Position = UDim2.fromOffset(10, 3)
			n.BackgroundTransparency = 1
			n.Font = Enum.Font.GothamBold
			n.TextSize = 12
			n.TextXAlignment = Enum.TextXAlignment.Left
			n.TextColor3 = rcol(e.rarity)
			n.Text = e.name .. ((e.qty or 1) > 1 and (" x" .. e.qty) or "")
			n.Parent = r
			local s = Instance.new("TextLabel")
			s.Size = UDim2.new(1, -20, 0, 16)
			s.Position = UDim2.fromOffset(10, 20)
			s.BackgroundTransparency = 1
			s.Font = Enum.Font.Gotham
			s.TextSize = 10
			s.TextXAlignment = Enum.TextXAlignment.Left
			s.TextColor3 = Color3.fromRGB(160, 160, 178)
			s.Text = e.t .. " • " .. e.rarity .. " • " .. (e.kind == "unit" and "UNIT" or "ITEM")
			s.Parent = r
		end
	else
		local normal, unique = getInventory()
		local grouped = {}
		local function push(id, qty)
			local g = iGroup(id)
			grouped[g] = grouped[g] or {}
			grouped[g][id] = (grouped[g][id] or 0) + (qty or 1)
		end
		for k, v in pairs(normal) do push(tostring(k), tonumber(v) or 1) end
		for _, v in pairs(unique) do
			if type(v) == "table" and v.item_id then push(tostring(v.item_id), 1) end
		end
		local cats = {}
		for g in pairs(grouped) do cats[#cats + 1] = g end
		table.sort(cats)
		local order = 0
		for _, g in ipairs(cats) do
			local total = 0
			for _, q in pairs(grouped[g]) do total = total + q end
			order = order + 1
			local h = header(content, g .. "  (" .. total .. ")")
			h.LayoutOrder = order
			local ids = {}
			for id in pairs(grouped[g]) do ids[#ids + 1] = id end
			table.sort(ids, function(a, b) return (grouped[g][a] or 0) > (grouped[g][b] or 0) end)
			for i = 1, math.min(#ids, 40) do
				local id = ids[i]
				order = order + 1
				local r = row(content, 34)
				r.LayoutOrder = order
				local n = Instance.new("TextLabel")
				n.Size = UDim2.new(1, -70, 1, 0)
				n.Position = UDim2.fromOffset(10, 0)
				n.BackgroundTransparency = 1
				n.Font = Enum.Font.GothamBold
				n.TextSize = 12
				n.TextXAlignment = Enum.TextXAlignment.Left
				n.TextColor3 = rcol(iRarity(id))
				n.Text = iName(id)
				n.Parent = r
				local q = Instance.new("TextLabel")
				q.Size = UDim2.fromOffset(52, 34)
				q.Position = UDim2.new(1, -56, 0, 0)
				q.BackgroundTransparency = 1
				q.Font = Enum.Font.GothamBold
				q.TextSize = 12
				q.TextColor3 = Color3.fromRGB(235, 235, 245)
				q.Text = "x" .. tostring(grouped[g][id])
				q.Parent = r
			end
		end
	end

	local pd = findProfile()
	local gold = pd and tonumber(pd.gold_amount) or 0
	local gem = pd and tonumber(pd.gem_amount) or 0
	local normal, unique = getInventory()
	local ucount, ncount = 0, 0
	for _ in pairs(unique) do ucount = ucount + 1 end
	for _ in pairs(normal) do ncount = ncount + 1 end
	footer.Text = "Gold " .. tostring(math.floor(gold)) .. " • Gem " .. tostring(math.floor(gem)) ..
		" • Unique " .. ucount .. " • Item " .. ncount .. "\\nWeb: " .. tostring(Hub.SyncStatus)
end

function Hub.Stop()
	Hub.Running = false
	for _, c in ipairs(Hub.Conns) do pcall(function() c:Disconnect() end) end
	Hub.Conns = {}
	pcall(function() gui:Destroy() end)
	pcall(function() toastGui:Destroy() end)
end
`
    : `
function Hub.Render() end

function Hub.Stop()
	Hub.Running = false
	for _, c in ipairs(Hub.Conns) do pcall(function() c:Disconnect() end) end
	Hub.Conns = {}
	pcall(function() toastGui:Destroy() end)
end
`;

  return `-- ============================================================
-- 2K | Anime Adventures — AA Vault Web Sync (HTTP + Clipboard + File)
-- ส่งข้อมูลจริงจากในเกมขึ้นเว็บเช็คของ AA Vault
-- ============================================================
if getgenv().TwoK then pcall(function() getgenv().TwoK.Stop() end) end

local SCRIPT_VERSION = "${SCRIPT_VERSION}"
local SCRIPT_UPDATED_AT = "${SCRIPT_UPDATED_AT}"
local WEB_URL = "${endpoint}"
local SYNC_KEY = "${syncKey}"
local AUTO_SYNC_SEC = ${intervalSec}

local Hub = {
	Running = true,
	Conns = {},
	Rewards = {},
	Totals = {},
	Tab = "team",
	Equipped = {},
	IconLookups = 0,
	LastSync = 0,
	SyncStartedAt = 0,
	SyncInFlight = false,
	SyncCount = 0,
	FailStreak = 0,
	UpdateNotified = false,
	LatestVersion = SCRIPT_VERSION,
	SyncOk = false,
	HttpBlocked = false,
	SyncStatus = "v" .. SCRIPT_VERSION .. " • กำลังเชื่อมต่อ...",
}
Hub.Flags = {Notify = true, Icons = true, MaxIcons = 45, WebSync = true}
getgenv().TwoK = Hub

local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")
local LP = Players.LocalPlayer
local PG = LP:WaitForChild("PlayerGui")

local httpRequest = request or http_request or httprequest or (syn and syn.request) or (fluxus and fluxus.request) or (http and http.request)
local copyClip = setclipboard or toclipboard or set_clipboard or (Clipboard and Clipboard.set)
local saveFile = writefile

local function conn(c) if c then Hub.Conns[#Hub.Conns + 1] = c end end
local function clock() local ok, s = pcall(os.date, "%H:%M:%S") if ok and s then return s end return "--:--:--" end
local function safeNum(v)
	local n = tonumber(v) or 0
	if n ~= n or n == math.huge or n == -math.huge then return 0 end
	return n
end

------------------------------------------------------------------
-- 1) DATA (ReplicatedStorage.src.Data)
------------------------------------------------------------------
local Items, Units = {}, {}
pcall(function() Items = require(RS.src.Data.Items) or {} end)
pcall(function() Units = require(RS.src.Data.Units) or {} end)
if type(Items) ~= "table" then Items = {} end
if type(Units) ~= "table" then Units = {} end

local function itemDef(id) local d = Items[id]; if type(d) == "table" then return d end end
local function unitDef(id) local d = Units[id]; if type(d) == "table" then return d end end
local function iName(id) local d = itemDef(id) return d and tostring(d.name or id) or tostring(id) end
local function iRarity(id) local d = itemDef(id) return d and tostring(d.rarity or "Common") or "Common" end
local function iGroup(id) local d = itemDef(id) return d and tostring(d.item_group or "Other") or "Other" end
local function uName(id) local d = unitDef(id) return d and tostring(d.name or id) or tostring(id) end
local function uRarity(id) local d = unitDef(id) return d and tostring(d.rarity or "Common") or "Common" end

local RCOL = {
	Common = Color3.fromRGB(160,160,172), Uncommon = Color3.fromRGB(110,200,120),
	Rare = Color3.fromRGB(90,160,255), Epic = Color3.fromRGB(180,110,255),
	Legendary = Color3.fromRGB(255,190,80), Mythic = Color3.fromRGB(255,120,90),
	Secret = Color3.fromRGB(255,100,165), Exclusive = Color3.fromRGB(130,220,235),
}
local function rcol(r) return RCOL[tostring(r)] or Color3.fromRGB(150,150,165) end

------------------------------------------------------------------
-- 2) PROFILE / INVENTORY / TEAM RESOLVERS
------------------------------------------------------------------
local function findProfile()
	if Hub.Profile then return Hub.Profile end
	for _, o in ipairs(getgc(true)) do
		if type(o) == "table" then
			local ok, inv = pcall(rawget, o, "inventory")
			if ok and type(inv) == "table" then
				local ok2, pd = pcall(rawget, o, "profile_data")
				if ok2 and type(pd) == "table" then
					Hub.Profile = pd
					Hub.Session = o
					return pd
				end
			end
		end
	end
	return nil
end

local function getInventory()
	local pd = findProfile()
	local inv = pd and pd.inventory
	if type(inv) ~= "table" then return {}, {} end
	local normal = type(inv.normal_items) == "table" and inv.normal_items or {}
	local unique = type(inv.unique_items) == "table" and inv.unique_items or {}
	return normal, unique
end

local function isUuid(s) return type(s) == "string" and #s >= 30 and s:sub(1,1) == "{" end

local function buildUnitMap()
	local map = {}
	local function harvest(t)
		if type(t) ~= "table" then return end
		for k, v in pairs(t) do
			if isUuid(k) and type(v) == "table" then
				local id = v.id or v.unit_id or v.item_id
				if type(id) == "string" and unitDef(id) then map[k] = v end
			end
		end
	end
	local pd = findProfile()
	if pd then
		harvest(pd.units); harvest(pd.inventory); harvest(pd.collection)
	end
	if next(map) == nil then
		for _, o in ipairs(getgc(true)) do
			if type(o) == "table" then harvest(o) end
		end
	end
	return map
end

local function findEquipped(unitMap)
	local pd = findProfile()
	local cands = {}
	if type(Hub.EquippedRaw) == "table" then cands[#cands + 1] = Hub.EquippedRaw end
	if pd then
		for _, key in ipairs({"equipped_units", "team_units", "units_equipped", "equipped"}) do
			local v = rawget(pd, key)
			if type(v) == "table" then cands[#cands + 1] = v end
		end
		if type(pd.loadouts_v2) == "table" then
			for _, v in pairs(pd.loadouts_v2) do
				if type(v) == "table" then
					cands[#cands + 1] = v
					for _, vv in pairs(v) do if type(vv) == "table" then cands[#cands + 1] = vv end end
				end
			end
		end
	end
	for _, t in ipairs(cands) do
		local out, ok, n = {}, true, 0
		for k, v in pairs(t) do
			n = n + 1
			if type(k) == "number" and (isUuid(v) or (type(v) == "table" and (unitDef(v.id) or unitDef(v.unit_id)))) then
				out[#out + 1] = {key = k, ref = v}
			else
				ok = false
			end
		end
		if ok and n > 0 and n <= 8 then
			table.sort(out, function(a, b) return a.key < b.key end)
			local res = {}
			for idx, e in ipairs(out) do
				local id, lvl, shiny, traits
				if isUuid(e.ref) then
					local u = unitMap and unitMap[e.ref]
					if u then id = u.id or u.unit_id; lvl = u.level or u.ingame_level; shiny = u.shiny; traits = u.traits or u._traits end
					if not id then id = tostring(e.ref) end
				else
					id = e.ref.id or e.ref.unit_id; lvl = e.ref.level; shiny = e.ref.shiny; traits = e.ref.traits or e.ref._traits
				end
				local traitList = {}
				if type(traits) == "table" then
					for tk, tv in pairs(traits) do
						if type(tv) == "string" then traitList[#traitList + 1] = tv
						else traitList[#traitList + 1] = tostring(tk) end
					end
				elseif type(traits) == "string" and traits ~= "" then
					traitList[1] = traits
				end
				res[#res + 1] = {
					slot = idx,
					id = tostring(id),
					name = uName(id),
					rarity = uRarity(id),
					level = safeNum(lvl or 1),
					shiny = shiny == true,
					traits = traitList,
				}
			end
			return res
		end
	end
	return {}
end

------------------------------------------------------------------
-- 3) BUILD REAL PAYLOAD + WEB SYNC (HTTP + CLIPBOARD + FILE)
------------------------------------------------------------------
local function buildPayloadJson()
	local pd = findProfile()
	local normal, unique = getInventory()
	local unitMap = buildUnitMap()
	local team = findEquipped(unitMap)

	local invList = {}
	local uniqueCounts = {}
	local uTotal = 0
	local nKinds = 0

	for k, v in pairs(normal) do
		local id = tostring(k)
		local qty = safeNum(v)
		if qty > 0 then
			nKinds = nKinds + 1
			invList[#invList + 1] = {
				id = id,
				name = iName(id),
				rarity = iRarity(id),
				group = iGroup(id),
				qty = qty,
				kind = "normal",
			}
		end
	end

	for _, v in pairs(unique) do
		if type(v) == "table" and v.item_id then
			local id = tostring(v.item_id)
			uniqueCounts[id] = (uniqueCounts[id] or 0) + 1
			uTotal = uTotal + 1
		end
	end
	for id, qty in pairs(uniqueCounts) do
		invList[#invList + 1] = {
			id = id,
			name = iName(id),
			rarity = iRarity(id),
			group = iGroup(id),
			qty = qty,
			kind = "unique",
		}
	end

	local recentRewards = {}
	for i = 1, math.min(#Hub.Rewards, 80) do
		local r = Hub.Rewards[i]
		recentRewards[#recentRewards + 1] = {
			t = tostring(r.t),
			ts = safeNum(r.ts),
			kind = tostring(r.kind),
			id = tostring(r.id),
			name = tostring(r.name),
			rarity = tostring(r.rarity),
			qty = safeNum(r.qty),
			src = tostring(r.src),
		}
	end

	local function colorToHex(c, fallback)
		if typeof and typeof(c) == "Color3" then
			local ok, hex = pcall(function() return "#" .. c:ToHex() end)
			if ok and hex then return hex end
		end
		return fallback
	end

	local function readCharacterAppearance()
		local ch = LP.Character
		if not ch then return nil end
		local rig = "R15"
		local hum = ch:FindFirstChildOfClass("Humanoid")
		if hum and hum.RigType == Enum.HumanoidRigType.R6 then
			rig = "R6"
		end
		local bc = ch:FindFirstChildOfClass("BodyColors")
		local headP = ch:FindFirstChild("Head")
		local torsoP = ch:FindFirstChild("UpperTorso") or ch:FindFirstChild("Torso")
		local laP = ch:FindFirstChild("LeftUpperArm") or ch:FindFirstChild("Left Arm")
		local raP = ch:FindFirstChild("RightUpperArm") or ch:FindFirstChild("Right Arm")
		local llP = ch:FindFirstChild("LeftUpperLeg") or ch:FindFirstChild("Left Leg")
		local rlP = ch:FindFirstChild("RightUpperLeg") or ch:FindFirstChild("Right Leg")
		return {
			avatarType = rig,
			bodyColors = {
				head = colorToHex((bc and bc.HeadColor3) or (headP and headP.Color), "#EAB892"),
				torso = colorToHex((bc and bc.TorsoColor3) or (torsoP and torsoP.Color), "#0D69AC"),
				leftArm = colorToHex((bc and bc.LeftArmColor3) or (laP and laP.Color), "#EAB892"),
				rightArm = colorToHex((bc and bc.RightArmColor3) or (raP and raP.Color), "#EAB892"),
				leftLeg = colorToHex((bc and bc.LeftLegColor3) or (llP and llP.Color), "#263238"),
				rightLeg = colorToHex((bc and bc.RightLegColor3) or (rlP and rlP.Color), "#263238"),
			},
		}
	end

	local okApp, liveAvatar = pcall(readCharacterAppearance)

	local payload = {
		syncKey = SYNC_KEY,
		username = LP.Name,
		displayName = LP.DisplayName,
		userId = LP.UserId,
		avatar = okApp and liveAvatar or nil,
		gold = pd and safeNum(pd.gold_amount) or 0,
		gems = pd and safeNum(pd.gem_amount) or 0,
		level = pd and safeNum(pd.level or pd.player_level) or nil,
		equipped = team,
		inventory = invList,
		rewards = recentRewards,
		uniqueCount = uTotal,
		normalKindCount = nKinds,
		scriptVersion = SCRIPT_VERSION,
		syncIntervalSec = AUTO_SYNC_SEC,
	}

	return HttpService:JSONEncode(payload), #team, #invList
end

function Hub.CopyForWeb()
	local ok, json, teamCount, invCount = pcall(buildPayloadJson)
	if not ok then
		Hub.SyncStatus = "สร้างข้อมูลล้มเหลว"
		pcall(Hub.Render)
		return
	end
	local packet = "AAVAULT_SYNC::" .. json
	local didClip = false
	if copyClip then
		didClip = pcall(copyClip, packet)
	end
	local fileName = "AAVault_" .. LP.Name .. ".json"
	if saveFile then
		pcall(saveFile, fileName, json)
	end
	if didClip then
		Hub.SyncStatus = "คัดลอกแล้ว (" .. teamCount .. " ตัว, " .. invCount .. " ไอเทม) — กด Ctrl+V บนเว็บได้เลย"
		pcall(function()
			Hub.Toast("info", "คัดลอกข้อมูลจริงแล้ว! กลับไปกด Ctrl+V บนเว็บ AA Vault", "Legendary", 1)
		end)
	elseif saveFile then
		Hub.SyncStatus = "บันทึกไฟล์ workspace/" .. fileName .. " แล้ว"
		pcall(function()
			Hub.Toast("info", "บันทึกไฟล์ " .. fileName .. " ใน workspace แล้ว", "Legendary", 1)
		end)
	else
		Hub.SyncStatus = "ตัวรันไม่รองรับ setclipboard / writefile"
	end
	pcall(Hub.Render)
end

function Hub.SyncToWeb(force, reason)
	if not Hub.Running or not Hub.Flags.WebSync then return end
	if Hub.HttpBlocked and not force then return end
	if not httpRequest then
		Hub.SyncStatus = "ตัวรันไม่รองรับ HTTP — กดปุ่ม 'คัดลอกข้อมูลเข้าเว็บ'"
		pcall(Hub.Render)
		return
	end
	if Hub.SyncInFlight and (os.clock() - Hub.SyncStartedAt) < 20 then return end
	if not force and (os.clock() - Hub.LastSync) < AUTO_SYNC_SEC then return end
	Hub.SyncInFlight = true
	Hub.SyncStartedAt = os.clock()
	Hub.LastSync = os.clock()

	task.spawn(function()
		local ok, err = pcall(function()
			local json = buildPayloadJson()
			-- บันทึกไฟล์สำรองใน workspace อัตโนมัติทุกครั้งถ้าตัวรันรองรับ
			if saveFile then
				pcall(saveFile, "AAVault_" .. LP.Name .. ".json", json)
			end
			local res = httpRequest({
				Url = WEB_URL,
				Method = "POST",
				Headers = { ["Content-Type"] = "application/json" },
				Body = json,
			})
			local code = res and tonumber(res.StatusCode) or 0
			local body = res and tostring(res.Body or "") or ""
			if code == 200 and body:find('"ok"') then
				Hub.SyncOk = true
				Hub.HttpBlocked = false
				Hub.FailStreak = 0
				Hub.SyncCount = Hub.SyncCount + 1
				local latestVer = SCRIPT_VERSION
				local decOk, decoded = pcall(function() return HttpService:JSONDecode(body) end)
				if decOk and type(decoded) == "table" and type(decoded.latestScriptVersion) == "string" and decoded.latestScriptVersion ~= "" then
					latestVer = decoded.latestScriptVersion
				end
				Hub.LatestVersion = latestVer
				if latestVer ~= SCRIPT_VERSION then
					Hub.SyncStatus = "ออนไลน์ (v" .. SCRIPT_VERSION .. " เก่ากว่า v" .. latestVer .. ") • " .. clock()
					if not Hub.UpdateNotified then
						Hub.UpdateNotified = true
						pcall(function()
							Hub.Toast("info", "มีอัปเดตสคริปต์ใหม่ v" .. latestVer .. " — รันคำสั่ง 1 บรรทัดใหม่ได้เลย", "Secret", 1)
						end)
					end
				else
					Hub.SyncStatus = "ออนไลน์ • ซิงค์ทุก " .. AUTO_SYNC_SEC .. " วิ (#" .. Hub.SyncCount .. " • " .. clock() .. ")"
				end
			elseif code == 302 or code == 401 or code == 403 or body:find("cookie_check") or body:find("accounts.google.com") then
				Hub.SyncOk = false
				Hub.HttpBlocked = true
				Hub.SyncStatus = "ติดล็อก Preview (HTTP " .. tostring(code) .. ") — กดปุ่ม 'คัดลอกข้อมูลเข้าเว็บ' ด้านบน"
				pcall(function()
					Hub.Toast("info", "เว็บติดล็อก Preview — กด 'คัดลอกข้อมูลเข้าเว็บ' แล้ว Ctrl+V บนเว็บ", "Epic", 1)
				end)
			else
				Hub.SyncOk = false
				Hub.FailStreak = Hub.FailStreak + 1
				Hub.SyncStatus = "HTTP " .. tostring(code) .. " — จะลองซิงค์ใหม่ใน " .. AUTO_SYNC_SEC .. " วิ"
			end
		end)
		if not ok then
			Hub.SyncOk = false
			Hub.FailStreak = Hub.FailStreak + 1
			Hub.SyncStatus = "เชื่อมต่อไม่ได้ — ลองใหม่ใน " .. AUTO_SYNC_SEC .. " วิ"
			warn("[2K WebSync] Sync error (" .. tostring(reason or "auto") .. "):", err)
		end
		Hub.SyncInFlight = false
		pcall(Hub.Render)
	end)
end

------------------------------------------------------------------
-- 4) REWARD CAPTURE
------------------------------------------------------------------
local function addReward(kind, id, qty, source)
	local name = kind == "unit" and uName(id) or iName(id)
	local rarity = kind == "unit" and uRarity(id) or iRarity(id)
	local key = kind .. "|" .. tostring(id)
	Hub.Totals[key] = (Hub.Totals[key] or 0) + (qty or 1)
	local entry = {
		t = clock(),
		ts = os.time() * 1000,
		kind = kind,
		id = tostring(id),
		name = name,
		rarity = rarity,
		qty = qty or 1,
		src = source or "",
	}
	table.insert(Hub.Rewards, 1, entry)
	if #Hub.Rewards > 200 then table.remove(Hub.Rewards, 200) end
	if Hub.Flags.Notify then
		pcall(function() Hub.Toast(kind, name, rarity, qty) end)
	end
	Hub.SyncToWeb(false)
end

local function scanPayload(payload, source)
	local seen = {}
	local function walk(v, depth)
		if depth > 4 then return end
		if type(v) == "string" then
			if not seen[v] then
				if Items[v] then seen[v] = true; addReward("item", v, 1, source)
				elseif Units[v] then seen[v] = true; addReward("unit", v, 1, source) end
			end
		elseif type(v) == "table" then
			for k, vv in pairs(v) do
				if type(k) == "string" and (Items[k] or Units[k]) then
					if not seen[k] then
						seen[k] = true
						local qty = (type(vv) == "number" and vv) or 1
						addReward(Items[k] and "item" or "unit", k, qty, source)
					end
				else
					walk(vv, depth + 1)
				end
			end
		end
	end
	walk(payload, 0)
end

local endpoints = RS:FindFirstChild("endpoints")
local S2C = endpoints and endpoints:FindFirstChild("server_to_client")

local function hookEvent(name, fn)
	if not S2C then return end
	local ev = S2C:FindFirstChild(name)
	if ev and ev:IsA("RemoteEvent") then
		conn(ev.OnClientEvent:Connect(function(...)
			local args = table.pack(...)
			pcall(fn, args)
		end))
	end
end

for _, n in ipairs({"show_unit_and_item_rewards", "unit_added", "unique_item_added", "normal_item_added"}) do
	hookEvent(n, function(args) scanPayload(args, n) end)
end
hookEvent("game_finished", function()
	pcall(function() Hub.Toast("info", "จบด่านแล้ว — อัปเดตข้อมูลแล้ว", "Legendary", 1) end)
	Hub.SyncToWeb(false)
end)

local lastUuids, lastNormal, invReadyAt = nil, nil, 0
function Hub.ResetInvBaseline()
	lastUuids = nil
	lastNormal = nil
	invReadyAt = 0
end

local function diffInventory(baselineOnly)
	local pd = findProfile()
	if not pd or type(pd.inventory) ~= "table" then return end
	local normal, unique = getInventory()
	local uset = {}
	local entryCount = 0
	for _, v in pairs(unique) do
		if type(v) == "table" and v.uuid then
			uset[tostring(v.uuid)] = tostring(v.item_id)
			entryCount = entryCount + 1
		end
	end
	local nset = {}
	for k, v in pairs(normal) do
		local q = tonumber(v) or 0
		nset[tostring(k)] = q
		if q > 0 then entryCount = entryCount + 1 end
	end

	-- รอจนกว่ากระเป๋าจะโหลดเสร็จจริง และเก็บเป็นฐานเริ่มต้นโดยไม่ส่งเข้า "ของดรอป"
	if not lastUuids then
		if entryCount > 0 then
			lastUuids, lastNormal = uset, nset
			invReadyAt = os.clock()
		end
		return
	end

	-- ช่วงอุ่นเครื่อง 5 วินาทีแรกหลังโหลดกระเป๋า ให้อัปเดตฐานเฉยๆ ไม่นับเป็นของดรอป
	if baselineOnly or (os.clock() - invReadyAt) < 5 then
		lastUuids, lastNormal = uset, nset
		return
	end

	local pending = {}
	local uCount = {}
	for u, id in pairs(uset) do
		if not lastUuids[u] then uCount[id] = (uCount[id] or 0) + 1 end
	end
	for id, q in pairs(uCount) do
		pending[#pending + 1] = { id = id, qty = q }
	end
	for id, q in pairs(nset) do
		local old = lastNormal[id] or 0
		if q > old then
			pending[#pending + 1] = { id = id, qty = q - old }
		end
	end

	lastUuids, lastNormal = uset, nset

	-- กันกรณีรีโหลดโปรไฟล์ทั้งกระเป๋าพร้อมกัน (โผล่ทีเดียวเกิน 12 ชนิด)
	if #pending > 12 then return end
	for _, d in ipairs(pending) do
		addReward("item", d.id, d.qty, "inventory")
	end
end

------------------------------------------------------------------
-- 5) TOAST NOTIFICATION
------------------------------------------------------------------
local toastGui = Instance.new("ScreenGui")
toastGui.Name = "2K_RewardToasts"
toastGui.ResetOnSpawn = false
toastGui.DisplayOrder = 90
pcall(function() toastGui.Parent = (gethui and gethui()) or PG end)
if not toastGui.Parent then toastGui.Parent = PG end

local toastHolder = Instance.new("Frame")
toastHolder.Size = UDim2.new(0, 320, 1, -40)
toastHolder.Position = UDim2.new(1, -335, 0, 20)
toastHolder.BackgroundTransparency = 1
toastHolder.Parent = toastGui
local tlist = Instance.new("UIListLayout", toastHolder)
tlist.Padding = UDim.new(0, 6)
tlist.SortOrder = Enum.SortOrder.LayoutOrder
tlist.VerticalAlignment = Enum.VerticalAlignment.Top

function Hub.Toast(kind, name, rarity, qty)
	local f = Instance.new("Frame")
	f.Size = UDim2.new(1, 0, 0, 44)
	f.BackgroundColor3 = Color3.fromRGB(20, 24, 34)
	f.BackgroundTransparency = 0.08
	f.BorderSizePixel = 0
	f.Parent = toastHolder
	Instance.new("UICorner", f).CornerRadius = UDim.new(0, 8)
	local st = Instance.new("UIStroke", f)
	st.Color = rcol(rarity); st.Thickness = 1.5
	local t1 = Instance.new("TextLabel")
	t1.Size = UDim2.new(1, -18, 0, 20)
	t1.Position = UDim2.fromOffset(10, 3)
	t1.BackgroundTransparency = 1
	t1.Font = Enum.Font.GothamBold
	t1.TextSize = 12
	t1.TextXAlignment = Enum.TextXAlignment.Left
	t1.TextColor3 = rcol(rarity)
	local prefix = kind == "unit" and "+ UNIT  " or (kind == "item" and "+ ITEM  " or "")
	t1.Text = prefix .. name .. ((qty or 1) > 1 and (" x" .. qty) or "")
	t1.Parent = f
	local t2 = Instance.new("TextLabel")
	t2.Size = UDim2.new(1, -18, 0, 14)
	t2.Position = UDim2.fromOffset(10, 24)
	t2.BackgroundTransparency = 1
	t2.Font = Enum.Font.Gotham
	t2.TextSize = 10
	t2.TextXAlignment = Enum.TextXAlignment.Left
	t2.TextColor3 = Color3.fromRGB(165, 175, 195)
	t2.Text = tostring(rarity) .. "  •  " .. clock()
	t2.Parent = f
	task.spawn(function()
		task.wait(3.5)
		local T = game:GetService("TweenService")
		pcall(function() T:Create(f, TweenInfo.new(0.35), {BackgroundTransparency = 1}):Play() end)
		pcall(function() T:Create(t1, TweenInfo.new(0.35), {TextTransparency = 1}):Play() end)
		pcall(function() T:Create(t2, TweenInfo.new(0.35), {TextTransparency = 1}):Play() end)
		task.wait(0.4)
		pcall(function() f:Destroy() end)
	end)
end
${guiSection}
------------------------------------------------------------------
-- 7) LOOP (Inventory Check + Periodic Online Heartbeat)
------------------------------------------------------------------
function Hub.Refresh(forceRender)
	if not Hub.Running then return end
	diffInventory()
	if forceRender or true then pcall(Hub.Render) end
end

-- ลูป 1: เช็คของเข้ากระเป๋าและอัปเดตหน้าต่างในเกมทุก 2 วินาที
task.spawn(function()
	pcall(diffInventory, true)
	while Hub.Running do
		pcall(Hub.Refresh)
		task.wait(2)
	end
end)

-- ลูป 2: ส่ง Heartbeat ซิงค์ขึ้นเว็บตามรอบเวลา AUTO_SYNC_SEC ตลอดขณะที่เปิดเกม
task.spawn(function()
	Hub.SyncToWeb(true, "startup")
	while Hub.Running do
		task.wait(AUTO_SYNC_SEC)
		if not Hub.Running then break end
		if not Hub.HttpBlocked then
			pcall(Hub.SyncToWeb, true, "heartbeat")
		end
	end
end)

pcall(Hub.Render)
Hub.Toast("info", "2K AA Vault v" .. SCRIPT_VERSION .. " เริ่มทำงาน — ซิงค์อัตโนมัติทุก " .. AUTO_SYNC_SEC .. " วิ", "Legendary", 1)
`;
}
