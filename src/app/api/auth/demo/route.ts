import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Access restricted" }, { status: 403 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Access restricted" }, { status: 403 });
}
