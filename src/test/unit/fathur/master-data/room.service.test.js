import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
	mockPrisma: {
		room: {
			findMany: vi.fn(),
			count: vi.fn(),
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
	},
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));

import * as adminRepo from "../../../../repositories/adminfeatures.repository.js";

import {
	getRooms,
	createRoom,
	updateRoom,
	deleteRoom,
} from "../../../../services/adminfeatures.service.js";

describe("Room Service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	describe("getRooms", () => {
		const roomRow = (overrides = {}) => ({
			id: "room-1",
			name: "Ruang A",
			location: "Gedung 1",
			capacity: 40,
			createdAt: new Date("2026-01-01T00:00:00.000Z"),
			updatedAt: new Date("2026-01-02T00:00:00.000Z"),
			_count: {
				internshipSeminars: 1,
				thesisSeminars: 0,
				thesisDefences: 1,
				yudisiums: 0,
			},
			...overrides,
		});

		it("returns data + total mapped from findRoomsPaginated", async () => {
			vi.spyOn(adminRepo, "findRoomsPaginated").mockResolvedValue({
				rooms: [
					roomRow(),
					roomRow({
						id: "room-2",
						name: "Ruang B",
						_count: {
							internshipSeminars: 0,
							thesisSeminars: 0,
							thesisDefences: 0,
							yudisiums: 0,
						},
					}),
				],
				total: 2,
			});

			const result = await getRooms({ page: 1, limit: 10, search: "", status: "all" });

			expect(result.data).toHaveLength(2);
			expect(result.total).toBe(2);
			expect(result.data[0]).toMatchObject({
				id: "room-1",
				relationCount: 2,
				canDelete: false,
			});
			expect(result.data[1]).toMatchObject({
				id: "room-2",
				relationCount: 0,
				canDelete: true,
			});
		});

		it("calls findRoomsPaginated with normalized status and pageSize as limit fallback", async () => {
			const spy = vi.spyOn(adminRepo, "findRoomsPaginated").mockResolvedValue({ rooms: [], total: 0 });

			await getRooms({ page: 2, pageSize: 15, search: "  Lab  ", status: "available" });

			expect(spy).toHaveBeenCalledWith({
				status: "available",
				search: "Lab",
				page: 2,
				limit: 15,
			});
		});

		it("defaults invalid status to all", async () => {
			const spy = vi.spyOn(adminRepo, "findRoomsPaginated").mockResolvedValue({ rooms: [], total: 0 });

			await getRooms({ status: "unknown" });

			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ status: "all" }));
		});
	});

	describe("createRoom", () => {
		it("creates room successfully when name+location is unique", async () => {
			mockPrisma.room.findFirst.mockResolvedValue(null);
			mockPrisma.room.create.mockResolvedValue({
				id: "room-new",
				name: "Ruang C",
				location: "Gedung 3",
				capacity: 30,
			});

			const result = await createRoom({
				name: " Ruang C ",
				location: " Gedung 3 ",
				capacity: 30,
			});

			expect(mockPrisma.room.create).toHaveBeenCalledWith({
				data: {
					name: "Ruang C",
					location: "Gedung 3",
					capacity: 30,
				},
			});
			expect(result).toMatchObject({ id: "room-new" });
		});

		it("throws 400 when name is empty", async () => {
			await expect(createRoom({ name: "   ", location: "Gedung 1", capacity: 20 })).rejects.toMatchObject({
				statusCode: 400,
			});
		});

		it("throws 400 when capacity is less than or equal to zero", async () => {
			await expect(createRoom({ name: "Ruang X", location: "Gedung 1", capacity: 0 })).rejects.toMatchObject({
				statusCode: 400,
			});
		});

		it("throws 409 when duplicate name+location already exists", async () => {
			mockPrisma.room.findFirst.mockResolvedValue({ id: "room-existing" });

			await expect(
				createRoom({ name: "Ruang A", location: "Gedung 1", capacity: 25 })
			).rejects.toMatchObject({ statusCode: 409 });
		});
	});

	describe("updateRoom", () => {
		const emptyCount = {
			internshipSeminars: 0,
			thesisSeminars: 0,
			thesisDefences: 0,
			yudisiums: 0,
		};

		it("throws 404 when room id does not exist", async () => {
			mockPrisma.room.findUnique.mockResolvedValue(null);

			await expect(
				updateRoom("missing-id", { name: "Ruang Baru", location: "Lantai 2", capacity: 40 })
			).rejects.toMatchObject({ statusCode: 404 });
		});

		it("updates name, location, and capacity when payload is valid and room has no relations", async () => {
			mockPrisma.room.findUnique.mockResolvedValue({
				id: "room-1",
				name: "Ruang Lama",
				location: "Gedung Lama",
				capacity: 20,
				_count: emptyCount,
			});
			mockPrisma.room.findFirst.mockResolvedValue(null);
			mockPrisma.room.update.mockResolvedValue({
				id: "room-1",
				name: "Ruang Baru",
				location: "Gedung Baru",
				capacity: 35,
			});

			const result = await updateRoom("room-1", {
				name: " Ruang Baru ",
				location: " Gedung Baru ",
				capacity: 35,
			});

			expect(mockPrisma.room.update).toHaveBeenCalledWith({
				where: { id: "room-1" },
				data: { name: "Ruang Baru", location: "Gedung Baru", capacity: 35 },
			});
			expect(result).toMatchObject({ id: "room-1", name: "Ruang Baru" });
		});

		it("throws 409 when update causes duplicate name+location on another room", async () => {
			mockPrisma.room.findUnique.mockResolvedValue({
				id: "room-1",
				name: "Ruang A",
				location: "Gedung 1",
				capacity: 20,
				_count: emptyCount,
			});
			mockPrisma.room.findFirst.mockResolvedValue({ id: "room-2" });

			await expect(
				updateRoom("room-1", { name: "Ruang B", location: "Gedung 2", capacity: 25 })
			).rejects.toMatchObject({ statusCode: 409 });
		});

		it("throws 400 when room has relations and name is changed", async () => {
			mockPrisma.room.findUnique.mockResolvedValue({
				id: "room-used",
				name: "Ruang X",
				location: "Lt.1",
				capacity: 30,
				_count: {
					internshipSeminars: 1,
					thesisSeminars: 0,
					thesisDefences: 0,
					yudisiums: 0,
				},
			});

			await expect(
				updateRoom("room-used", { name: "Ruang Y", location: "Lt.1", capacity: 30 })
			).rejects.toMatchObject({
				statusCode: 400,
				message: "Ruangan yang sudah digunakan untuk penjadwalan tidak dapat mengubah nama",
			});
			expect(mockPrisma.room.update).not.toHaveBeenCalled();
		});

		it("allows location and capacity updates when room has relations but name unchanged", async () => {
			mockPrisma.room.findUnique.mockResolvedValue({
				id: "room-used",
				name: "Ruang X",
				location: "Lt.1",
				capacity: 30,
				_count: {
					internshipSeminars: 0,
					thesisSeminars: 1,
					thesisDefences: 0,
					yudisiums: 0,
				},
			});
			mockPrisma.room.findFirst.mockResolvedValue(null);
			mockPrisma.room.update.mockResolvedValue({
				id: "room-used",
				name: "Ruang X",
				location: "Lt.2",
				capacity: 40,
			});

			const result = await updateRoom("room-used", {
				name: "Ruang X",
				location: "Lt.2",
				capacity: 40,
			});

			expect(mockPrisma.room.update).toHaveBeenCalledWith({
				where: { id: "room-used" },
				data: { name: "Ruang X", location: "Lt.2", capacity: 40 },
			});
			expect(result).toMatchObject({ location: "Lt.2", capacity: 40 });
		});
	});

	describe("deleteRoom", () => {
		it("throws 404 when room id is not found", async () => {
			mockPrisma.room.findUnique.mockResolvedValue(null);

			await expect(deleteRoom("missing-room")).rejects.toMatchObject({ statusCode: 404 });
		});

		it("throws 400 when room has related seminar/defence/yudisium data", async () => {
			mockPrisma.room.findUnique.mockResolvedValue({
				id: "room-used",
				_count: {
					internshipSeminars: 1,
					thesisSeminars: 0,
					thesisDefences: 1,
					yudisiums: 0,
				},
			});

			await expect(deleteRoom("room-used")).rejects.toMatchObject({ statusCode: 400 });
			expect(mockPrisma.room.delete).not.toHaveBeenCalled();
		});

		it("deletes room successfully when relation counts are zero", async () => {
			mockPrisma.room.findUnique.mockResolvedValue({
				id: "room-free",
				_count: {
					internshipSeminars: 0,
					thesisSeminars: 0,
					thesisDefences: 0,
					yudisiums: 0,
				},
			});
			mockPrisma.room.delete.mockResolvedValue({ id: "room-free" });

			const result = await deleteRoom("room-free");

			expect(mockPrisma.room.delete).toHaveBeenCalledWith({ where: { id: "room-free" } });
			expect(result).toEqual({ success: true });
		});
	});
});
