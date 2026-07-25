import { ImageResponse } from "next/og";
import { getListSocialTitle } from "@/lib/lists";
import { getListWithAccess } from "./get-list-access";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Listenvorschau";

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getListWithAccess(id);

  const title = access
    ? getListSocialTitle(access.list.category, access.list.title, access.username)
    : "Liste nicht gefunden";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#09090b",
          color: "#fafafa",
          padding: "80px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#a1a1aa",
            marginBottom: 24,
            display: "flex",
          }}
        >
          Toppi
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.2,
            display: "flex",
          }}
        >
          {title}
        </div>
      </div>
    ),
    { ...size },
  );
}
