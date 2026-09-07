using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace FitnessTracker.Api;

public sealed class FoodSearch(HttpClient http, IMemoryCache cache)
{
    public record Hit(string Name, string? Brand, string Barcode, double KcalPer100g, double? ProteinPer100g, double? CarbsPer100g, double? FatPer100g);

    // ponytail: search index only, never fan out to the product API (it allows ~10 requests per minute per IP)
    public async Task<List<Hit>> SearchAsync(string q, CancellationToken ct)
    {
        q = q.Trim().ToLowerInvariant();
        if (q.Length < 2) return [];
        return (await cache.GetOrCreateAsync("food:" + q, async e =>
        {
            e.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24);
            using var doc = await http.GetFromJsonAsync<JsonDocument>(
                $"https://search.openfoodfacts.org/search?q={Uri.EscapeDataString(q)}&langs=en&page_size=25&fields=code,product_name,brands,nutriments", ct);
            return Parse(doc!.RootElement);
        }))!;
    }

    public static List<Hit> Parse(JsonElement root)
    {
        var hits = new List<Hit>();
        var seen = new HashSet<string>();
        if (!root.TryGetProperty("hits", out var arr) || arr.ValueKind != JsonValueKind.Array) return hits;
        foreach (var h in arr.EnumerateArray())
        {
            var code = Str(h, "code");
            var name = Str(h, "product_name");
            if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(name) || !seen.Add(code)) continue;
            h.TryGetProperty("nutriments", out var n);
            var kcal = Num(n, "energy-kcal_100g") ?? (Num(n, "energy_100g") is double kj ? kj / 4.184 : null);
            if (kcal is null) continue;
            var brand = h.TryGetProperty("brands", out var b) && b.ValueKind == JsonValueKind.Array && b.GetArrayLength() > 0 ? b[0].GetString() : Str(h, "brands");
            hits.Add(new Hit(name, brand, code, Math.Round(kcal.Value), Num(n, "proteins_100g"), Num(n, "carbohydrates_100g"), Num(n, "fat_100g")));
            if (hits.Count == 10) break;
        }
        return hits;
    }

    static string? Str(JsonElement e, string key) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    static double? Num(JsonElement e, string key) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;
}
